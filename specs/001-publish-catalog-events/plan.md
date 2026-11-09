# Implementation Plan: Publish Catalog Events

**Branch**: `[001-publish-catalog-events]` | **Date**: 2026-11-08 | **Spec**: `specs/001-publish-catalog-events/spec.md`

**Input**: Feature specification from `/specs/001-publish-catalog-events/spec.md`

## Summary

Publish catalog mutation events by enabling DynamoDB Streams on the entity table and routing stream records through an EventBridge Pipe into the existing SQS FIFO queue. Use the shared event schema from `ServerlessOpsIO/backstage-app/specs/010-catalog-event-updates/contracts/catalog-entity-change-notification.schema.json`, discover queue destination details from SSM parameters, and surface unresolved delivery failures via DLQ/alarm signals without rolling back successful mutations.

## Technical Context

**Language/Version**: TypeScript (project compiles with TypeScript 6.x) on `nodejs24.x` Lambda runtime

**Primary Dependencies**: AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/client-ssm`, `@aws-sdk/client-sqs` as needed), AWS Lambda Powertools Logger, AWS SAM, API Gateway OpenAPI

**Storage**: DynamoDB single-table entity store (`pk`/`sk`) plus DynamoDB Stream; SSM Parameter Store for queue discovery; external SQS FIFO queue + DLQ for delivery lifecycle

**Testing**: Jest unit tests for handlers/helpers, plus `sam validate --lint` for infrastructure validation

**Target Platform**: AWS SAM stack (`template.yaml` + `openapi.yaml`) deployed by GitHub Actions

**Project Type**: Serverless API service with infrastructure-managed asynchronous event publication

**Performance Goals**:
- Maintain SC-001 target: successful mutations become consumer-available events within 60 seconds.
- Maintain SC-004 target: 99% first-attempt delivery under normal operations; unresolved failures surfaced within 5 minutes.

**Constraints**:
- Event publication path must be DynamoDB Stream -> EventBridge Pipe -> SQS (no synchronous API coupling).
- Event payload must conform to shared contract from the referenced backstage spec.
- Queue provisioning is out of scope; queue name and URL come from separate SSM parameters, and the queue ARN is resolved by an SSM-backed CloudFormation parameter named `SqsQueueArn` using `/platform/backstage/backstage-app/main/SqsQueueArn`.
- Mutation success must remain independent from downstream delivery success.
- Preserve per-entity ordering and at-least-once delivery semantics.

**Scale/Scope**:
- All successful create/update/delete catalog mutations from this API.
- One event per committed state change (including rapid sequential changes) with stable event IDs for retries.
- Infrastructure and contract updates limited to this repository's producer-side responsibilities.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Gate Review

1. **Backstage Entity Fidelity (I)** — **PASS**  
   The feature emits mutation events derived from committed entity changes and does not alter entity identity rules (`namespace/kind/name`).

2. **OpenAPI Contract First (II)** — **PASS**  
   No new API routes or response shapes are required for this feature; existing OpenAPI contract remains source of truth.

3. **Serverless, Minimal Compute, Least Privilege (III)** — **PASS**  
   Event publication is infrastructure-managed (stream + pipe) instead of adding always-on compute; IAM for pipe/source/target roles will be least-privilege and resource-scoped.

4. **Stable Data Model (IV)** — **PASS**  
   DynamoDB primary key model remains unchanged; stream enablement is additive.

5. **Security by Default (V)** — **PASS**  
   Queue discovery via SSM parameters avoids hardcoded destination values; no secrets introduced in source.

6. **Testing and Quality Gates (VI)** — **PASS (planned)**  
   Plan includes unit test updates and `sam validate --lint` for infra changes.

7. **Consistent Responses and Observability (VII)** — **PASS**  
   API responses remain unchanged; unresolved publication failures will be surfaced through explicit operational signals.

8. **Simplicity (VIII)** — **PASS**  
   Pipe-based routing avoids unnecessary publisher Lambdas and keeps responsibilities clear.

## Project Structure

### Documentation (this feature)

```text
specs/001-publish-catalog-events/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── catalog-change-event.schema.json
│   └── event-publication-contract.md
└── tasks.md   # Generated later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── handlers/
│   ├── CreateEntity/function.ts
│   ├── DeleteEntity/function.ts
│   └── GetEntity/function.ts
└── lib/
    ├── ErrorResponseType.ts
    └── SuccessResponseType.ts

template.yaml
openapi.yaml
```

**Structure Decision**: Keep a single-project SAM service layout. Implement event publication through infrastructure resources in `template.yaml`, with minimal focused updates in existing handlers/libs only where needed for no-op suppression or observability alignment.

## Phase 0 Output (Research)

Research decisions are documented in `specs/001-publish-catalog-events/research.md` and resolve all technical unknowns for stream-to-queue event publication and contract compatibility.

## Phase 1 Output (Design & Contracts)

Phase 1 artifacts are provided at:
- `specs/001-publish-catalog-events/data-model.md`
- `specs/001-publish-catalog-events/contracts/catalog-change-event.schema.json`
- `specs/001-publish-catalog-events/contracts/event-publication-contract.md`
- `specs/001-publish-catalog-events/quickstart.md`

## Post-Design Constitution Check

1. **Principles I, II, IV, VII** — **PASS**: design keeps API/entity contract stable while adding async publication contract artifacts.
2. **Principle III** — **PASS**: design uses managed stream + pipe routing, no additional always-on compute, least-privilege IAM explicitly required.
3. **Principle V** — **PASS**: destination lookup is SSM-based and parameterized.
4. **Principle VI** — **PASS**: quickstart defines validation scenarios that include unit/infrastructure checks and failure visibility.
5. **Principle VIII** — **PASS**: complexity remains justified and bounded to the requested flow.

No constitution violations require complexity exceptions.

## Complexity Tracking

| Addition | Why Needed | Alternatives Considered | Operational Cost |
|---|---|---|---|
| EventBridge Pipes | The requested DynamoDB Stream-to-SQS path needs managed filtering and transformation without coupling delivery to API mutation handlers. | Direct handler publishing couples mutation success to SQS availability; a stream-triggered publisher Lambda adds compute and code to operate. | Adds managed Pipe charges and IAM, monitoring, and DLQ configuration; accepted because Pipes provide the requested managed integration without another function. |
