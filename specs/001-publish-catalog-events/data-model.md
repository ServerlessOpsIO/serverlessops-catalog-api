# Phase 1 Data Model: Publish Catalog Events

## Entity: CatalogEntityItem (existing persisted source)

Represents a catalog entity stored in DynamoDB and already used by CRUD handlers.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `pk` | string | Yes | `<namespace>/<kind-lowercase>` partition key. |
| `sk` | string | Yes | `<namespace>/<kind-lowercase>/<name>` sort key. |
| `itemType` | string | Yes | `entity` for catalog rows. |
| `apiVersion` | string | Yes | Backstage entity API version. |
| `kind` | string | Yes | Entity kind (stored value may preserve case, key uses lowercase). |
| `metadata` | object | Yes | Must include `name`; may include `namespace`. |
| `spec` | object | No | Backstage entity spec data. |

### Validation rules

- Stream publication only applies to `itemType = entity`.
- Identity in event payload must be derived from persisted keys/attributes, not request-only values.

## Entity: CatalogChangeEvent (producer message payload)

Message delivered to SQS FIFO, contract-aligned with `backstage-app/specs/010-catalog-event-updates/contracts/catalog-entity-change-notification.schema.json`.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `eventId` | string | Yes | Unique ID for one logical change; must be stable across retries of that change. |
| `changeType` | enum(`create`,`update`,`delete`) | Yes | Mapped from stream event name (`INSERT`,`MODIFY`,`REMOVE`). |
| `entityRef` | string | Yes | `<namespace>/<kind>/<name>` stable identity reference. |
| `entity` | object | Yes | Full entity snapshot (`apiVersion`, `kind`, `metadata`, etc.). |
| `source` | string | No | Producer identifier (recommended for diagnostics). |
| `occurredAt` | string(date-time) | No | Publication timestamp. |
| `schemaVersion` | string | No | Contract version marker for non-breaking evolution. |

### Validation rules

- Payload must satisfy `catalog-change-event.schema.json`.
- `changeType` unsupported values are rejected.
- `entityRef` must match `^[^/]+/[^/]+/[^/]+$`.
- `entity.metadata.name` is required for all message types.

## Entity: EventDestinationConfiguration

Represents queue discovery configuration resolved from SSM Parameter Store.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `queueNameParameter` | string | Yes | `/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueName`. |
| `queueUrlParameter` | string | Yes | `/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueUrl`. |
| `queueName` | string | Yes | SQS FIFO queue name (ends with `.fifo`). |
| `queueUrl` | string | Yes | Full queue URL matching the same queue. |
| `queueArn` | string | Yes (derived) | Required for IAM scope and pipe target binding. |

### Validation rules

- `queueName` and `queueUrl` must resolve to the same queue resource.
- Queue provisioning remains external; missing/invalid parameters produce deployment/runtime failure signals.

## Entity: PublicationFailureSignal

Operationally visible unresolved-delivery signal produced when retries are exhausted.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `eventId` | string | Yes | Correlates to failed logical change. |
| `entityRef` | string | Yes | Target entity identity. |
| `failureStage` | enum(`pipe-transform`,`pipe-target-send`,`dlq-route`) | Yes | Failure classification. |
| `reason` | string | Yes | Diagnostic message/code. |
| `attemptCount` | integer | Yes | Attempts observed before unresolved status. |
| `signalTimestamp` | string(date-time) | Yes | Time unresolved failure became visible. |

### Validation rules

- Must be emitted for unresolved failures (no silent drops).
- Must include enough fields for operator triage and replay correlation.

## Relationships

- One `CatalogEntityItem` mutation creates one DynamoDB stream record.
- One stream record maps to one `CatalogChangeEvent`.
- One `CatalogChangeEvent` targets one resolved `EventDestinationConfiguration`.
- Failed deliveries eventually emit one `PublicationFailureSignal` terminal outcome.

## State transitions

1. `mutation-committed` (DynamoDB write succeeds)
2. `stream-record-created`
3. `pipe-filtered-and-transformed`
4. `sqs-publish-attempted`
5. Terminal outcomes:
   - `published`
   - `retried` (transient failure)
   - `unresolved-failure-signaled` (after retries exhausted / DLQ path)

