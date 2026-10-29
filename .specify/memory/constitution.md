<!--
Sync Impact Report
Version change: unresolved scaffold → 1.0.0 (initial ratification)
Modified principles: none
Added principles: I. Backstage Entity Fidelity; II. OpenAPI Contract First;
  III. Serverless, Minimal Compute, Least Privilege; IV. Stable Data Model;
  V. Security by Default; VI. Testing and Quality Gates; VII. Consistent
  Responses and Observability; VIII. Simplicity
Added sections: Technology and Deployment Constraints; Development Workflow
Removed sections: none
Follow-up TODOs: no unresolved placeholders. CI test and quality-gate work is
  deferred because this command is limited to the constitution file.
-->

# ServerlessOps Catalog API Constitution

## Core Principles

### I. Backstage Entity Fidelity

- The API MUST store Backstage entities and return entity-valued payloads that conform to the
  `Entity` type from `@backstage/catalog-model`. The list endpoint MUST return entity identifiers
  in the shape defined by the OpenAPI contract.
- Entity identity MUST be namespace, kind, and `metadata.name`; the kind used for storage keys and
  lookups MUST be lowercased.
- The API MUST remain limited to health checks, entity CRUD, upsert, and paged listing by namespace
  and kind. New capabilities MUST be justified by a concrete need from the Backstage provider or a
  data-loading client. General-purpose search, relations processing, and semantic catalog validation
  beyond the request schema are out of scope.

Rationale: A narrow, typed contract keeps this service a dependable source for Backstage entities.

### II. OpenAPI Contract First

- `openapi.yaml` MUST be the source of truth for routes, request and response schemas, request
  validation, authorization, and API Gateway integrations; `template.yaml` MUST include it through
  `AWS::Include`.
- Contract changes MUST be made in `openapi.yaml` before or alongside handler changes. API Gateway
  MUST validate request parameters and bodies with the `all` request validator. Handlers MAY rely on
  gateway schema validation, but MUST check path/body consistency where applicable, including that
  an upsert path matches the entity metadata.
- Changes to paths, response shapes, status codes, or `nextToken`/`limit` paging semantics MUST be
  identified as breaking changes and coordinated with the
  `catalog-backend-module-serverlessops-catalog` provider. README API examples MUST be updated in
  the same change.

Rationale: A contract-first API prevents the provider and deployed API from drifting apart.

### III. Serverless, Minimal Compute, Least Privilege

- Each Lambda-backed operation MUST have a focused function. Pure data access without additional
  logic MUST use a direct API Gateway-to-DynamoDB integration, as the list operation does.
- Each function and integration role MUST receive only the IAM actions it requires. Read handlers
  MUST have read-only access, delete handlers MUST have delete-only access, and new functions MUST
  NOT use broad managed policies such as `DynamoDBCrudPolicy`. Existing broad-policy uses are debt
  and MUST be replaced when those handlers are modified.
- Lambda functions MUST use 128 MB memory and a 5-second timeout unless the plan justifies
  different values.

Rationale: Narrow permissions and small, focused compute reduce cost and limit the impact of errors.

### IV. Stable Data Model

- The service MUST use one DynamoDB table with `PAY_PER_REQUEST` billing. Each entity item MUST
  use `pk = "<namespace>/<kind>"`, `sk = "<namespace>/<kind>/<name>"`, and `itemType = "entity"`.
- Changes to key structure, access patterns, or indexes MUST include a documented migration and
  backfill plan and MUST keep existing records working.
- Create MUST fail when the item already exists by using a conditional write. Upsert MAY overwrite
  an existing item.

Rationale: A stable, intentionally small data model makes existing entity records safe to operate.

### V. Security by Default

- Every API route, including health checks, MUST require the Cognito user-pool authorizer; the API
  MUST NOT expose unauthenticated routes.
- Source code MUST NOT contain secrets, credentials, or real account IDs. Environment-specific
  values MUST come from SAM parameters, `cfn-parameters.json`, or GitHub secrets as appropriate.
- Logs MUST NOT contain tokens or credentials. Full API request events MUST be logged only at
  DEBUG level.

Rationale: Authentication, controlled configuration, and bounded logging protect the API and its
callers.

### VI. Testing and Quality Gates (NON-NEGOTIABLE)

- New or changed handler logic MUST have Jest unit tests with the DynamoDB client mocked. Tests
  MUST cover success, relevant conditional-check failures, DynamoDB client faults (4xx), and service
  faults (5xx).
- GitHub Actions MUST run lint, TypeScript compilation, unit tests, and `sam validate --lint`
  successfully before building artifacts or deploying. The existing `TODO: Need to run tests` gap
  in `.github/workflows` MUST be closed before those workflows are considered compliant.
- TypeScript MUST use strict typing and MUST avoid `any`. Caught errors MUST be explicitly
  type-asserted or narrowed before their fields are accessed.

Rationale: Automated checks and focused fault-path tests prevent regressions from reaching deployed
stacks.

### VII. Consistent Responses and Observability

- Successful operation acknowledgements MUST use the shared response type and include
  `request_id` from the Lambda `awsRequestId`. Entity reads MUST return an entity, and list and
  health responses MUST follow their OpenAPI schemas.
- Error responses MUST use the shared `ErrorResponseType` shape `{ error, message }`. AWS SDK
  client faults MUST map to 4xx responses and service faults MUST map to 5xx responses. Not-found
  results MUST map to 404; create conflicts MUST use 409 or 400 as declared by the contract.
  Create MUST return 201 and successful upsert and get operations MUST return 200.
- Handlers MUST use AWS Lambda Powertools Logger for structured JSON logging, with
  `POWERTOOLS_SERVICE_NAME` set from the stack. API Gateway access logging and metrics MUST remain
  enabled.

Rationale: Consistent response shapes and structured telemetry make API behavior diagnosable and
predictable for clients.

### VIII. Simplicity (YAGNI)

- Plans proposing a new AWS service, framework, Lambda layer, or shared abstraction MUST justify
  its need, alternatives, and operational cost in the plan's Complexity Tracking table.
- Handlers MUST remain small and focused and MUST share code through `src/lib` where appropriate;
  abstractions without a concrete current use case MUST NOT be added.

Rationale: Avoiding unnecessary infrastructure and abstractions keeps the service maintainable.

## Technology and Deployment Constraints

- Application code MUST use TypeScript ESM and MUST be built by SAM esbuild for `nodejs24.x`, with
  target `es2024` and `.mjs` output. `package.json` MUST declare an engine range aligned with
  Node.js 24. Yarn 4 MUST be the only package manager.
- Infrastructure MUST be defined in `template.yaml` and `openapi.yaml`; console-only changes MUST
  NOT be used to configure the service.
- Deployment MUST occur only through GitHub Actions. Pushes to `main` MUST deploy to production,
  and branch builds MUST use the branch name as the API stage. `EnableMinify` and `EnableSourceMaps`
  MUST remain build-time template defaults.

## Development Workflow

- Work MUST occur on feature branches and be proposed through pull requests to `main`. Specs MUST
  use this repository's Spec Kit conventions: timestamp-based numbering and
  `<component>-spec-<timestamp>` naming. Plans MUST be reviewed through pull requests.
- Each pull request MUST keep `openapi.yaml`, README API examples, and `catalog-info.yaml` accurate.
- Plans MUST pass the Constitution Check before research and again after design. Reviewers MUST
  verify compliance with this constitution.

## Governance

- This constitution supersedes conflicting project guidance. Existing code that conflicts with a
  rule is technical debt to fix, not precedent.
- Amendments MUST be proposed in a pull request with a rationale. Use semantic versioning: MAJOR
  for removal or redefinition of a principle, MINOR for adding a principle or section, and PATCH
  for clarification.
- Every amendment MUST update the Version, Ratified, and Last Amended lines. When an amendment
  changes a gate referenced by `.specify/templates`, the amendment's follow-up MUST propagate that
  change to the affected templates.

**Version**: 1.0.0 | **Ratified**: 2026-10-29 | **Last Amended**: 2026-10-29
