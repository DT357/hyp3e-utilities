# PKG-001 1.0.0 release-candidate verification

Date: 2026-08-15

Result: `PASS` for the pre-publication gate

## Release metadata and payload

- `module.json` and `package.json` both declare version `1.0.0`.
- The manifest repository, manifest, download, issue, and license URLs passed
  validation.
- `scripts/release-files.txt` is the canonical ZIP payload list.
- The payload includes every runtime directory, license and notice files,
  `README.md`, `CHANGELOG.md`, and `docs/user-guide.md`.
- Tests and development-only documentation are excluded from the installable
  archive.

The local candidate was produced from that list and inspected as a ZIP:

- Artifact: `.foundry-test/packages/hyp3e-utilities-1.0.0-rc.zip`
- Size: 112,866 bytes
- Entries: 64, including directory entries
- SHA-256:
  `8BE5E2809BB44177603D0FDB1C49C729F81B6CB710767FC17573F383FC5AB832`
- Standalone `module.json` SHA-256:
  `7120E6F0C640BB5F34519B1328270984A6321698CCDE231A493478D71C15DCC2`
- All entry names use forward slashes; the root `module.json`, user guide, and
  changelog were read successfully from the archive.

The ignored local candidate is evidence only. GitHub Actions builds the final
ZIP independently from the tagged source.

## Workflow gate

The workflow now:

1. runs the complete validation suite;
2. requires matching manifest and package versions;
3. packages only the canonical payload;
4. tests the ZIP and compares its embedded manifest with the standalone file;
5. generates and verifies SHA-256 hashes for both release assets;
6. retains the three-file candidate as a private workflow artifact; and
7. on an authorized version tag only, downloads that exact artifact, verifies
   its checksums and tag/version match, then publishes the ZIP, manifest, and
   checksum file.

The release job never rebuilds an artifact. Ordinary pushes and pull requests
cannot publish a release.

## Clean Foundry installation

The exact local candidate was extracted into the new disposable data root
`.foundry-test/pkg001-v14`. The root contained copied test-only Foundry license
state, `hyp3e` 4.1.0, and SocketLib 1.1.4; it did not contain the diagnostic
module or a working-tree junction.

Foundry 14.365 started on port 33394 and its setup UI discovered:

- Hyp3e Utilities `1.0.0`;
- the green verified-for-this-version badge; and
- SocketLib `1.1.4`.

The Hyp3e Utilities package card contained no error or compatibility-warning
badge. The server error log was empty. The browser client and server were
closed, and port 33394 was confirmed clear.

The complete product behavior on clean Foundry 13.351 and 14.365 worlds is
recorded in `2026-08-15-hrd005-clean-matrix.md`; the production code in this
candidate is unchanged from that passing matrix.

## Automated checks

- Test-first metadata, payload, and workflow assertions failed against the old
  0.5.0 packaging and passed after implementation.
- Complete `npm run check`: 236 tests passed; production and diagnostic syntax
  checks and manifest validation passed.

## Publication boundary

No release tag was created and no public release was published. Installing and
updating through the live public URLs is impossible before publication and is
therefore tracked as `REL-001`, a post-authorization gate outside Milestone 6.
