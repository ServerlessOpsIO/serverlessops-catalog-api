# Phase 0 Research: Publish Catalog Events

## Decision: Publish via DynamoDB Stream -> EventBridge Pipe -> SQS FIFO

**Rationale**:  
This matches the requested architecture, decouples API mutation latency from downstream delivery, and provides durable delivery semantics using AWS-managed retries and redrive.

**Alternatives considered**:
- Publish directly from API handlers with `SendMessage` (rejected: couples mutation path to queue availability and violates desired architecture).
- Publish through a dedicated publisher Lambda subscribed to the stream (rejected: additional compute/operational overhead with no clear need versus native Pipe transform/filter).

## Decision: Use shared catalog event payload contract from backstage-app spec `010-catalog-event-updates`

**Rationale**:  
The consumer-side spec is authoritative for message shape. Reusing that schema prevents producer/consumer drift and ensures contract validation remains consistent across repositories.

**Alternatives considered**:
- Define a producer-local schema only (rejected: high drift risk and duplicated contract governance).
- Emit minimal reference-only payload and force consumer fetches (rejected: consumer spec requires full snapshot payload and no normal-case API lookup).

## Decision: Map DynamoDB stream records to change events as `INSERT -> create`, `MODIFY -> update`, `REMOVE -> delete`

**Rationale**:  
DynamoDB stream `eventName` is the most direct committed-state signal after persistence, which satisfies "only publish for successful persisted changes."

**Alternatives considered**:
- Infer operation type in API handlers and attach metadata in item attributes (rejected: duplicates intent already available in stream semantics and adds write-path coupling).
- Emit a single generic `change` type (rejected: violates contract requirement for explicit change classification).

## Decision: Discover destination via SSM parameters using required naming convention

**Rationale**:  
Feature spec requires centralized discovery rather than hardcoding. Queue name and URL use separate parameters under `/${Domain}/${System}/${Component}/${CodeBranch}/...`; the `SqsQueueArn` CloudFormation parameter resolves the SSM key `/platform/backstage/backstage-app/main/SqsQueueArn`.

**Alternatives considered**:
- Hardcode queue URL/ARN in template or code (rejected: environment coupling and violates FR-005).
- Discover by tag lookup at runtime (rejected: higher IAM/query complexity and weak determinism).

## Decision: Maintain separate queue name and queue URL parameters, with queue name as cross-repo compatibility anchor

**Rationale**:  
Current feature clarifications require separate `SqsQueueName` and `SqsQueueUrl` parameters. The referenced backstage spec explicitly relies on `SqsQueueName`; retaining both satisfies local requirement while preserving consumer compatibility.

**Alternatives considered**:
- Queue name only (rejected for this repo: conflicts with clarified local requirement).
- Queue URL only (rejected: conflicts with referenced consumer-side expectation and reduces portability for consumers that resolve URL from name).

## Decision: Surface unresolved publication failures through DLQ and alarmed operational signals

**Rationale**:  
The feature requires successful mutations to remain committed while publication failures are retried and unresolved failures are visible. Pipe target retry + DLQ + CloudWatch alarm/logging satisfies this without transactional rollback of writes.

**Alternatives considered**:
- Fail mutation when publish fails (rejected: contradicts clarified delivery guarantee).
- Retry indefinitely without escalation (rejected: unresolved failures would be silent and operationally unsafe).

## Decision: Preserve per-entity ordering using FIFO message group strategy

**Rationale**:  
Per-entity ordering can be preserved by deriving FIFO message grouping from entity identity (or partition key equivalent) while retaining unique event IDs for dedupe/traceability.

**Alternatives considered**:
- Global FIFO message group for all events (rejected: unnecessary throughput bottleneck).
- Standard queue without message groups (rejected: cannot guarantee ordered processing for sequential entity updates).
