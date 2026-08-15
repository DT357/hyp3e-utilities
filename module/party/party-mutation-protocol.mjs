import {
  MODULE_ID,
  SETTING_KEYS,
} from '../core/constants.mjs';
import { evaluatePartyEditPermission } from './party-permissions.mjs';
import { SocketTransportUnavailableError } from '../socket/socket-transport.mjs';

const ENVELOPE_KEYS = Object.freeze([
  'expectedRevision',
  'payload',
  'requestId',
]);
const OPERATION_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const PARTY_MUTATION_ERROR_CODES = Object.freeze({
  executionFailed: 'executionFailed',
  invalidRequest: 'invalidRequest',
  transportUnavailable: 'transportUnavailable',
  unauthorized: 'unauthorized',
  unknownOperation: 'unknownOperation',
});

export class PartyMutationError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PartyMutationError';
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertExactObject(value, {
  allowedKeys,
  label = 'Object',
  requiredKeys = allowedKeys,
} = {}) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  if (!Array.isArray(allowedKeys) || !Array.isArray(requiredKeys)) {
    throw new TypeError('Exact-object keys must be arrays.');
  }
  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownKeys.length) {
    throw new TypeError(`${label} has unknown field "${unknownKeys[0]}".`);
  }
  const missingKeys = requiredKeys.filter(
    (key) => !Object.hasOwn(value, key),
  );
  if (missingKeys.length) {
    throw new TypeError(`${label} is missing field "${missingKeys[0]}".`);
  }
  return value;
}

function deepFreeze(value, seen = new Set()) {
  if (
    (!Array.isArray(value) && !isPlainObject(value))
    || seen.has(value)
  ) return value;
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function getRequestId(envelope) {
  return typeof envelope?.requestId === 'string'
    ? envelope.requestId.trim() || null
    : null;
}

function createErrorResult(operation, requestId, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return deepFreeze({
    error,
    ok: false,
    operation,
    requestId: requestId ?? null,
  });
}

function createSuccessResult(operation, requestId, value) {
  return deepFreeze({
    ok: true,
    operation,
    requestId,
    value,
  });
}

function validateEnvelope(envelope) {
  assertExactObject(envelope, {
    allowedKeys: ENVELOPE_KEYS,
    label: 'Mutation request',
  });
  const requestId = getRequestId(envelope);
  if (!requestId || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new TypeError('Mutation requestId is invalid.');
  }
  if (
    !Number.isInteger(envelope.expectedRevision)
    || envelope.expectedRevision < 0
  ) {
    throw new TypeError('Mutation expectedRevision must be a non-negative integer.');
  }
  if (!isPlainObject(envelope.payload)) {
    throw new TypeError('Mutation payload must be a plain object.');
  }
  return {
    expectedRevision: envelope.expectedRevision,
    payload: envelope.payload,
    requestId,
  };
}

export function createPartyMutationProtocol({
  game,
  logger = console,
  maxCompletedRequests = 100,
  permissionEvaluator = evaluatePartyEditPermission,
  transport,
} = {}) {
  if (!Number.isInteger(maxCompletedRequests) || maxCompletedRequests < 1) {
    throw new TypeError('maxCompletedRequests must be a positive integer.');
  }
  const completedRequests = new Map();
  const inFlightRequests = new Map();
  const operations = new Map();

  function getRequester(userId) {
    return typeof userId === 'string' ? game?.users?.get?.(userId) ?? null : null;
  }

  function authorize(requester) {
    let minimumEditRole;
    let explicitEditorUserIds;
    try {
      minimumEditRole = game?.settings?.get?.(
        MODULE_ID,
        SETTING_KEYS.partySheetMinimumEditRole,
      );
      explicitEditorUserIds = game?.settings?.get?.(
        MODULE_ID,
        SETTING_KEYS.partySheetExplicitEditorUserIds,
      );
    }
    catch (error) {
      logger.warn?.('Party permission settings could not be read.', error);
      return false;
    }
    return permissionEvaluator({
      explicitEditorUserIds,
      minimumEditRole,
      user: requester,
    }).allowed;
  }

  function rememberCompleted(key, result) {
    completedRequests.set(key, result);
    while (completedRequests.size > maxCompletedRequests) {
      completedRequests.delete(completedRequests.keys().next().value);
    }
  }

  async function dispatch(operation, definition, request, requester) {
    let payload;
    try {
      payload = await definition.validatePayload(request.payload);
      if (!isPlainObject(payload)) {
        throw new TypeError('Payload validator must return a plain object.');
      }
    }
    catch (error) {
      return createErrorResult(
        operation,
        request.requestId,
        PARTY_MUTATION_ERROR_CODES.invalidRequest,
        error?.message ?? 'Mutation payload is invalid.',
      );
    }

    try {
      const value = await definition.execute({
        expectedRevision: request.expectedRevision,
        payload,
        requester,
        requestId: request.requestId,
      });
      return createSuccessResult(operation, request.requestId, value);
    }
    catch (error) {
      if (error instanceof PartyMutationError) {
        return createErrorResult(
          operation,
          request.requestId,
          error.code,
          error.message,
          error.details,
        );
      }
      logger.warn?.(`Party mutation "${operation}" failed.`, error);
      return createErrorResult(
        operation,
        request.requestId,
        PARTY_MUTATION_ERROR_CODES.executionFailed,
        'The party operation could not be completed.',
      );
    }
  }

  async function handleRequest(operation, envelope, requesterUserId) {
    let request;
    try {
      request = validateEnvelope(envelope);
    }
    catch (error) {
      return createErrorResult(
        operation,
        getRequestId(envelope),
        PARTY_MUTATION_ERROR_CODES.invalidRequest,
        error?.message ?? 'Mutation request is invalid.',
      );
    }

    const requester = getRequester(requesterUserId);
    if (!requester || !authorize(requester)) {
      return createErrorResult(
        operation,
        request.requestId,
        PARTY_MUTATION_ERROR_CODES.unauthorized,
        'The requesting user is not authorized to edit the Party Sheet.',
      );
    }

    const key = `${requester.id}:${request.requestId}`;
    if (completedRequests.has(key)) return completedRequests.get(key);
    if (inFlightRequests.has(key)) return inFlightRequests.get(key);

    const pending = dispatch(
      operation,
      operations.get(operation),
      request,
      requester,
    ).then((result) => {
      rememberCompleted(key, result);
      return result;
    }).finally(() => {
      inFlightRequests.delete(key);
    });
    inFlightRequests.set(key, pending);
    return pending;
  }

  function registerOperation(operation, { execute, validatePayload }) {
    if (
      typeof operation !== 'string'
      || !OPERATION_NAME_PATTERN.test(operation)
    ) {
      throw new TypeError(`Party operation name "${operation}" is invalid.`);
    }
    if (typeof execute !== 'function' || typeof validatePayload !== 'function') {
      throw new TypeError(`Party operation "${operation}" requires validation and execution handlers.`);
    }
    if (operations.has(operation)) {
      throw new TypeError(`Party operation "${operation}" is already registered.`);
    }
    const definition = Object.freeze({ execute, validatePayload });
    operations.set(operation, definition);
    try {
      transport.registerOperation(operation, function mutationHandler(envelope) {
        return handleRequest(operation, envelope, this?.socketdata?.userId);
      });
    }
    catch (error) {
      operations.delete(operation);
      throw error;
    }
  }

  async function request(operation, envelope) {
    if (!operations.has(operation)) {
      return createErrorResult(
        operation,
        getRequestId(envelope),
        PARTY_MUTATION_ERROR_CODES.unknownOperation,
        `Party operation "${operation}" is not registered.`,
      );
    }
    try {
      return await transport.executeAsActiveGM(operation, envelope);
    }
    catch (error) {
      if (error instanceof SocketTransportUnavailableError) {
        return createErrorResult(
          operation,
          getRequestId(envelope),
          PARTY_MUTATION_ERROR_CODES.transportUnavailable,
          error.message,
        );
      }
      logger.warn?.(`Party mutation transport for "${operation}" failed.`, error);
      return createErrorResult(
        operation,
        getRequestId(envelope),
        PARTY_MUTATION_ERROR_CODES.transportUnavailable,
        'The active GM could not process the party operation.',
      );
    }
  }

  return Object.freeze({
    registerOperation,
    request,
  });
}
