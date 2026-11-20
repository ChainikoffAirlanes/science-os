# Science OS contributor rules

- Read SPECIFICATION.txt and PROGRESS.md before changing scope.
- Keep all production research data in Supabase, never localStorage.
- No AI features, paid APIs, Google Drive, private server or Docker requirement.
- All product interface text must be Russian.
- New tables require RLS, explicit grants, constraints and an integration authorization test.
- SECURITY DEFINER functions need a fixed search_path, auth checks and restricted EXECUTE.
- Never commit .env files, test-account credentials, personal records, service_role keys or database passwords.
- Run npm run typecheck, npm run lint, npm test and npm run build after substantive changes.
- Distinguish local SQL tests, mocked browser tests and real hosted integration tests in reports.
- Update PROGRESS.md with observed evidence. Never mark an unexecuted test Passed.
