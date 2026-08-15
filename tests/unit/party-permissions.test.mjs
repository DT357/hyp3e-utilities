import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTY_EDIT_PERMISSION_REASONS,
  canEditPartySheet,
  evaluatePartyEditPermission,
} from '../../module/party/party-permissions.mjs';

function evaluate(user, {
  minimumEditRole = 4,
  explicitEditorUserIds = [],
} = {}) {
  return evaluatePartyEditPermission({
    explicitEditorUserIds,
    minimumEditRole,
    user,
  });
}

test('minimum-role policy covers every Foundry role and threshold', () => {
  for (let minimumEditRole = 1; minimumEditRole <= 4; minimumEditRole += 1) {
    for (let role = 1; role <= 4; role += 1) {
      const decision = evaluate({ id: `role-${role}`, isGM: false, role }, {
        minimumEditRole,
      });
      assert.equal(
        decision.allowed,
        role >= minimumEditRole,
        `role ${role}, threshold ${minimumEditRole}`,
      );
      assert.equal(
        decision.reason,
        role >= minimumEditRole
          ? PARTY_EDIT_PERMISSION_REASONS.minimumRole
          : PARTY_EDIT_PERMISSION_REASONS.denied,
      );
    }
  }
});

test('GM and explicit grants authorize independently of the role threshold', () => {
  assert.deepEqual(evaluate({ id: 'gm', isGM: true, role: 0 }, {
    minimumEditRole: 4,
    explicitEditorUserIds: 'malformed-for-a-non-gm',
  }), {
    allowed: true,
    reason: PARTY_EDIT_PERMISSION_REASONS.gm,
  });

  assert.deepEqual(evaluate({ id: 'granted', isGM: false, role: 1 }, {
    minimumEditRole: 4,
    explicitEditorUserIds: [' other ', 'granted', 'granted'],
  }), {
    allowed: true,
    reason: PARTY_EDIT_PERMISSION_REASONS.explicitGrant,
  });

  assert.equal(evaluate({ id: 'other', isGM: false, role: 1 }, {
    explicitEditorUserIds: ['granted'],
  }).allowed, false);
});

test('missing users and invalid configuration fail closed for non-GMs', () => {
  assert.deepEqual(evaluate(null), {
    allowed: false,
    reason: PARTY_EDIT_PERMISSION_REASONS.missingUser,
  });

  for (const minimumEditRole of [0, 5, 1.5, '2', null]) {
    assert.deepEqual(evaluate({ id: 'player', isGM: false, role: 4 }, {
      minimumEditRole,
    }), {
      allowed: false,
      reason: PARTY_EDIT_PERMISSION_REASONS.invalidConfiguration,
    });
  }

  for (const explicitEditorUserIds of [null, {}, 'player']) {
    assert.deepEqual(evaluate({ id: 'player', isGM: false, role: 4 }, {
      explicitEditorUserIds,
    }), {
      allowed: false,
      reason: PARTY_EDIT_PERMISSION_REASONS.invalidConfiguration,
    });
  }
});

test('malformed user role cannot satisfy a threshold but an ID grant still can', () => {
  assert.deepEqual(evaluate({ id: 'granted', isGM: false }, {
    minimumEditRole: 1,
    explicitEditorUserIds: ['granted'],
  }), {
    allowed: true,
    reason: PARTY_EDIT_PERMISSION_REASONS.explicitGrant,
  });
  assert.deepEqual(evaluate({ id: 'not-granted', isGM: false, role: '4' }, {
    minimumEditRole: 1,
  }), {
    allowed: false,
    reason: PARTY_EDIT_PERMISSION_REASONS.denied,
  });
});

test('boolean helper mirrors immutable permission decisions without mutating input', () => {
  const explicitEditorUserIds = ['player'];
  const user = { id: 'player', isGM: false, role: 1 };
  const options = { explicitEditorUserIds, minimumEditRole: 4, user };
  const decision = evaluatePartyEditPermission(options);

  assert.equal(canEditPartySheet(options), true);
  assert.equal(Object.isFrozen(decision), true);
  assert.deepEqual(explicitEditorUserIds, ['player']);
  assert.deepEqual(user, { id: 'player', isGM: false, role: 1 });
});
