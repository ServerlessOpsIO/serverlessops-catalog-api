# Tasks: Publish Catalog Events

**Input**: Design documents from `/specs/001-publish-catalog-events/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare test scaffolding and shared assets used by all stories.

- [X] T001 Add contract-validation and AWS SDK client-mock test dependencies in `package.json`
- [X] T002 [P] Add event payload fixtures for create/update/delete in `specs/001-publish-catalog-events/contracts/fixtures/create-event.json`, `specs/001-publish-catalog-events/contracts/fixtures/update-event.json`, and `specs/001-publish-catalog-events/contracts/fixtures/delete-event.json`
- [X] T003 [P] Add schema test helper for loading/compiling `specs/001-publish-catalog-events/contracts/catalog-change-event.schema.json` in `tests/support/catalog-change-event-schema.ts`
- [X] T004 [P] Add SAM template test helper for resource lookups in `tests/support/template-resource-loader.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core event-publication infrastructure that blocks all user stories.

**⚠️ CRITICAL**: No user story work starts before this phase completes.

- [X] T005 Enable DynamoDB stream (`NEW_AND_OLD_IMAGES`) and explicit stateful policies on `DdbTable` in `template.yaml`
- [X] T006 Add SSM queue discovery for `/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueName` and `/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueUrl`, and add a `SqsQueueArn` CloudFormation parameter of type `AWS::SSM::Parameter::Value<String>` using `/platform/backstage/backstage-app/main/SqsQueueArn` in `template.yaml`
- [X] T007 Create least-privilege EventBridge Pipe execution IAM roles/policies (stream read + queue send) in `template.yaml`
- [X] T008 [P] Add publication failure observability primitives (log group, metric filter, alarm) in `template.yaml`

**Checkpoint**: Foundation ready for user-story delivery.

---

## Phase 3: User Story 1 - Deliver change events for catalog mutations (Priority: P1) 🎯 MVP

**Goal**: Publish one consumer-available event for each successful create/update/delete mutation.

**Independent Test**: Execute create, update, and delete API mutations and verify one corresponding logical event per successful persisted mutation; allow duplicate deliveries and identify them by stable `eventId`.

### Tests for User Story 1

- [X] T009 [P] [US1] Add infrastructure unit tests for stream enablement and pipe wiring in `tests/unit/infrastructure/catalog-event-pipes.unit.test.ts`

### Implementation for User Story 1

- [X] T010 [US1] Add INSERT pipe in `template.yaml` mapping DynamoDB `INSERT` to `changeType=create` while enforcing "Stream publication only applies to `itemType = entity`."
- [X] T011 [US1] Add MODIFY pipe in `template.yaml` mapping DynamoDB `MODIFY` to `changeType=update` while enforcing "Stream publication only applies to `itemType = entity`."
- [X] T012 [US1] Add REMOVE pipe in `template.yaml` mapping DynamoDB `REMOVE` to `changeType=delete` while enforcing "Stream publication only applies to `itemType = entity`."
- [X] T013 [US1] Configure FIFO ordering/dedup parameters in `template.yaml` so per-entity ordering is preserved and retries reuse stable event identifiers
- [X] T014 [US1] Update verification steps for create/update/delete publication in `specs/001-publish-catalog-events/quickstart.md`

**Checkpoint**: User Story 1 works independently and satisfies MVP publication flow.

---

## Phase 4: User Story 2 - Ensure events are consumer-compatible (Priority: P2)

**Goal**: Produce schema-valid events that match the shared consumer contract.

**Independent Test**: Validate emitted events against the shared schema and confirm required identity and change-type fields are populated correctly.

### Tests for User Story 2

- [X] T015 [P] [US2] Add schema validation tests for emitted payload fixtures in `tests/unit/contracts/catalog-change-event.schema.unit.test.ts`
- [X] T016 [P] [US2] Add negative-case schema tests in `tests/unit/contracts/catalog-change-event.schema.unit.test.ts` to assert "`changeType` unsupported values are rejected." and "`entity.metadata.name` is required for all message types."

### Implementation for User Story 2

- [X] T017 [US2] Update pipe input templates in `template.yaml` so required payload fields are always present and "Payload must satisfy `catalog-change-event.schema.json`."
- [X] T018 [US2] Map identity fields from stream records in `template.yaml` so "Identity in event payload must be derived from persisted keys/attributes, not request-only values." and "`entityRef` must match `^[^/]+/[^/]+/[^/]+$`."
- [X] T019 [US2] Align producer contract details and references in `specs/001-publish-catalog-events/contracts/event-publication-contract.md`

**Checkpoint**: User Story 2 passes independent schema/contract validation.

---

## Phase 5: User Story 3 - Prevent misleading or silent event behavior (Priority: P3)

**Goal**: Avoid success-like events for failed/no-op mutations and make unresolved publication failures operator-visible.

**Independent Test**: Force mutation and publication failure paths, then verify no false-positive success events and visible unresolved failure signals.

### Tests for User Story 3

- [ ] T020 [P] [US3] Add no-op upsert and failed-mutation unit tests in `src/handlers/CreateEntity/function.unit.test.ts` and `src/handlers/DeleteEntity/function.unit.test.ts`
- [ ] T021 [P] [US3] Add destination-configuration validation tests in `tests/unit/infrastructure/catalog-event-pipes.unit.test.ts` to assert `queueName`, `queueUrl`, and `SqsQueueArn` resolve to the same queue resource.

### Implementation for User Story 3

- [ ] T022 [US3] Refactor upsert write path in `src/handlers/CreateEntity/function.ts` to suppress no-op writes so unchanged entities do not emit change events
- [ ] T023 [US3] Configure pipe retry and dead-letter routing in `template.yaml` so unresolved failures are surfaced and "Must be emitted for unresolved failures (no silent drops)."
- [ ] T024 [US3] Add failure-signal observability fields and alarm context in `template.yaml` and `specs/001-publish-catalog-events/quickstart.md` so signals "Must include enough fields for operator triage and replay correlation."
- [ ] T025 [US3] Document controlled failure-injection validation for unresolved delivery signals in `specs/001-publish-catalog-events/quickstart.md`

**Checkpoint**: User Story 3 independently verifies trustworthy event semantics and failure visibility.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish integration quality gates and documentation updates across stories.

- [ ] T026 [P] Add CI steps to run `yarn run test:unit` followed by `yarn run lint` before build in `.github/workflows/main.yml` and `.github/workflows/branch.yml`
- [ ] T027 [P] Update service-level event publication documentation in `README.md`
- [ ] T028 Run final validation command updates and expected outcomes in `specs/001-publish-catalog-events/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2.
- **Phase 4 (US2)**: Depends on Phase 2 and uses US1 publication plumbing.
- **Phase 5 (US3)**: Depends on Phase 2 and hardens US1/US2 behavior.
- **Phase 6 (Polish)**: Depends on completion of targeted user stories.

### User Story Dependencies

- **US1 (P1)**: Starts immediately after foundational completion.
- **US2 (P2)**: Starts after foundational completion; can run alongside late US1 verification once pipe resources exist.
- **US3 (P3)**: Starts after foundational completion; depends on established publication path to validate retry/failure behavior.

### Within Each User Story

- Write tests first, confirm they fail, then implement.
- Infrastructure/resource wiring before behavior verification docs.
- Story checkpoint must pass before moving to the next priority story for sequential delivery.

---

## Parallel Opportunities

- Phase 1: T002, T003, and T004 can run in parallel.
- Phase 2: T008 can run in parallel with T006/T007 once T005 is underway.
- US1: T009 can run while pipe templates are being authored; INSERT/MODIFY/REMOVE pipe tasks can be split by engineer then merged carefully.
- US2: T015 and T016 run in parallel.
- US3: T020 and T021 run in parallel.
- Polish: T026 and T027 run in parallel.

---

## Parallel Example: User Story 1

```bash
# Parallelize US1 test + infrastructure authoring
Task: "T009 [US1] Add infrastructure unit tests in tests/unit/infrastructure/catalog-event-pipes.unit.test.ts"
Task: "T010-T012 [US1] Add INSERT/MODIFY/REMOVE pipes in template.yaml"
```

## Parallel Example: User Story 2

```bash
# Parallelize schema test coverage
Task: "T015 [US2] Add schema validation tests in tests/unit/contracts/catalog-change-event.schema.unit.test.ts"
Task: "T016 [US2] Add negative-case schema tests in tests/unit/contracts/catalog-change-event.schema.unit.test.ts"
```

## Parallel Example: User Story 3

```bash
# Parallelize behavior and infrastructure checks
Task: "T020 [US3] Add no-op/failed-mutation unit tests in src/handlers/CreateEntity/function.unit.test.ts and src/handlers/DeleteEntity/function.unit.test.ts"
Task: "T021 [US3] Add queue destination validation tests in tests/unit/infrastructure/catalog-event-pipes.unit.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1.
2. Complete Phase 2 (blocking).
3. Complete Phase 3 (US1).
4. Validate end-to-end mutation → event publication before expanding scope.

### Incremental Delivery

1. Ship US1 for baseline event publication.
2. Add US2 to enforce contract compatibility.
3. Add US3 to harden failure handling and operational trust.
4. Finish polish tasks for CI/documentation completeness.

### Parallel Team Strategy

1. Team completes Phase 1 and Phase 2 together.
2. Then split by story focus:
   - Engineer A: US1 infrastructure completion and quickstart validation
   - Engineer B: US2 schema/contract tests
   - Engineer C: US3 no-op suppression and failure observability
