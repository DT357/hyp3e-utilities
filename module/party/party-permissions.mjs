import {
  validateExplicitEditorUserIds,
  validateMinimumEditRole,
} from '../settings/settings.mjs';

export const PARTY_EDIT_PERMISSION_REASONS = Object.freeze({
  denied: 'denied',
  explicitGrant: 'explicitGrant',
  gm: 'gm',
  invalidConfiguration: 'invalidConfiguration',
  minimumRole: 'minimumRole',
  missingUser: 'missingUser',
});

function createDecision(allowed, reason) {
  return Object.freeze({ allowed, reason });
}

export function evaluatePartyEditPermission({
  explicitEditorUserIds = [],
  minimumEditRole = 4,
  user,
} = {}) {
  if (user?.isGM === true) {
    return createDecision(true, PARTY_EDIT_PERMISSION_REASONS.gm);
  }
  if (!user || typeof user.id !== 'string' || !user.id.trim()) {
    return createDecision(false, PARTY_EDIT_PERMISSION_REASONS.missingUser);
  }
  if (
    !Number.isInteger(minimumEditRole)
    || !Array.isArray(explicitEditorUserIds)
  ) {
    return createDecision(
      false,
      PARTY_EDIT_PERMISSION_REASONS.invalidConfiguration,
    );
  }

  let normalizedEditorUserIds;
  let normalizedMinimumRole;
  try {
    normalizedEditorUserIds = validateExplicitEditorUserIds(
      explicitEditorUserIds,
    );
    normalizedMinimumRole = validateMinimumEditRole(minimumEditRole);
  }
  catch {
    return createDecision(
      false,
      PARTY_EDIT_PERMISSION_REASONS.invalidConfiguration,
    );
  }

  if (normalizedEditorUserIds.includes(user.id.trim())) {
    return createDecision(
      true,
      PARTY_EDIT_PERMISSION_REASONS.explicitGrant,
    );
  }
  if (Number.isInteger(user.role) && user.role >= normalizedMinimumRole) {
    return createDecision(
      true,
      PARTY_EDIT_PERMISSION_REASONS.minimumRole,
    );
  }
  return createDecision(false, PARTY_EDIT_PERMISSION_REASONS.denied);
}

export function canEditPartySheet(options) {
  return evaluatePartyEditPermission(options).allowed;
}
