# Feature Specification: Publish Catalog Events

**Feature Branch**: `[001-publish-catalog-events]`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "https://github.com/ServerlessOpsIO/serverlessops-catalog-api/issues/13"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deliver change events for catalog mutations (Priority: P1)

As a downstream catalog consumer, I need an event whenever a catalog entity is created, updated, or deleted so that dependent systems stay synchronized with catalog state.

**Why this priority**: This is the core value of the feature and the explicit business objective of the request.

**Independent Test**: Can be fully tested by performing create, update, and delete mutations and verifying that one corresponding event is available to consumers for each successful state change.

**Acceptance Scenarios**:

1. **Given** a valid create mutation that stores a new entity, **When** the mutation succeeds, **Then** a single create event for that entity is published for consumers.
2. **Given** a valid update mutation that changes an existing entity, **When** the mutation succeeds, **Then** a single update event for that entity is published for consumers.
3. **Given** a valid delete mutation that removes an existing entity, **When** the mutation succeeds, **Then** a single delete event for that entity is published for consumers.

---

### User Story 2 - Ensure events are consumer-compatible (Priority: P2)

As an integration consumer, I need events to follow the shared catalog-event contract so that I can parse and process them without custom per-source handling.

**Why this priority**: Contract compatibility prevents downstream breakage and enables immediate consumption by the dependent system.

**Independent Test**: Can be tested by validating produced events against the shared contract and confirming required fields are present and correctly populated.

**Acceptance Scenarios**:

1. **Given** a published catalog change event, **When** a consumer validates it against the shared contract, **Then** validation succeeds with no schema mismatches.
2. **Given** multiple event-producing mutations, **When** events are consumed, **Then** each event includes the operation type and entity identity needed to apply the change.

---

### User Story 3 - Prevent misleading or silent event behavior (Priority: P3)

As an operator, I need failed mutations to avoid publishing success-like events and publication failures to be visible so that downstream systems can trust event meaning and teams can remediate delivery problems.

**Why this priority**: Operational trust depends on events representing real committed changes and on failures being diagnosable.

**Independent Test**: Can be tested by forcing mutation failures and publication failures, then confirming no false success events are emitted and unresolved delivery failures are surfaced.

**Acceptance Scenarios**:

1. **Given** a mutation request that fails before data is changed, **When** the request is completed, **Then** no catalog change event is published.
2. **Given** a successful data mutation and a temporary delivery outage, **When** publication cannot complete immediately, **Then** the system retries delivery and emits an operator-visible failure signal if retry limits are exceeded.

### Edge Cases

- A mutation request that does not change persisted entity content must not produce a change event.
- A delete request for an entity that does not exist must not produce a change event.
- Rapid consecutive updates to the same entity must each produce a distinct event with a unique event identifier.
- Duplicate delivery attempts for the same underlying change must remain identifiable by consumers via a stable event identifier.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST publish a catalog change event for every successful create, update, or delete mutation that changes persisted catalog entity state.
- **FR-002**: The system MUST classify each published event with the effective change type (create, update, or delete) that occurred in persisted state.
- **FR-003**: The system MUST include entity identity (namespace, kind, and name), event occurrence timestamp, and a unique event identifier in every published event.
- **FR-004**: The system MUST produce events that conform to the shared catalog-event contract referenced by the dependent consumer specification.
- **FR-005**: The system MUST discover the event destination through centrally managed runtime configuration rather than hardcoded destination identifiers.
- **FR-006**: The system MUST NOT publish a catalog change event for mutation requests that fail before persisting a state change.
- **FR-007**: The system MUST retry event delivery after transient publication failures and MUST surface unresolved publication failures through operational error signals.
- **FR-008**: The system MUST preserve per-entity change ordering in published events when multiple successful changes occur sequentially for the same entity.

### Key Entities *(include if feature involves data)*

- **Catalog Change Event**: A consumer-facing record describing one committed catalog entity mutation, including operation type, entity identity, event ID, and event timestamp.
- **Event Destination Configuration**: Runtime-managed configuration that identifies where catalog change events are delivered.
- **Publication Failure Signal**: Operationally visible record indicating that an event could not be delivered after retries and requires intervention.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful create, update, and delete mutations produce a corresponding consumer-available change event within 60 seconds.
- **SC-002**: 0% of mutation requests that fail before persistence produce catalog change events in acceptance testing.
- **SC-003**: 100% of sampled published events validate against the shared catalog-event contract without schema errors.
- **SC-004**: At least 99% of events are delivered on first publish attempt during normal operations, and 100% are either successfully delivered or surfaced as unresolved failures within 5 minutes.

## Assumptions

- The dependent consumer’s catalog-event contract in `ServerlessOpsIO/backstage-app` is authoritative for event shape and required fields.
- The event destination used by consumers already exists and is managed outside this feature’s scope.
- This feature covers entity mutations initiated through this API’s create, update/upsert, and delete behaviors for catalog entities.
- Consumers can handle at-least-once delivery semantics by using the event identifier for deduplication.
