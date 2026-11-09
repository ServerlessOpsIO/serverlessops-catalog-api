# Event Publication Contract: Catalog API -> SQS FIFO

## Scope

Defines producer-side delivery contract for publishing catalog mutation events from this API using:

1. DynamoDB Stream
2. EventBridge Pipe
3. Existing external SQS FIFO queue

## Queue discovery contract

- Queue identifiers MUST be discovered from SSM parameters, never hardcoded.
- Required parameter names:
  - `/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueName`
  - `/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueUrl`
- The `SqsQueueArn` CloudFormation parameter MUST resolve the SSM parameter `/platform/backstage/backstage-app/main/SqsQueueArn` for the EventBridge Pipe target and scoped IAM policy.
- `SqsQueueName` MUST remain present for compatibility with the referenced consumer spec in `ServerlessOpsIO/backstage-app/specs/010-catalog-event-updates`.
- `SqsQueueName` and `SqsQueueUrl` MUST resolve to the same queue resource.

## Message shape contract

- Payload MUST validate against `contracts/catalog-change-event.schema.json`.
- `changeType` mapping:
  - DynamoDB stream `INSERT` -> `create`
  - DynamoDB stream `MODIFY` -> `update`
  - DynamoDB stream `REMOVE` -> `delete`
- Producer MUST create one logical event per committed mutation. Delivery is at-least-once, so consumers may receive duplicate messages and MUST deduplicate by stable `eventId`.
- Producer MUST include:
  - `eventId` (unique per logical mutation, stable on retries)
  - `entityRef`
  - `entity` snapshot

## Ordering and delivery semantics

- Transport is FIFO SQS; per-entity ordering MUST be preserved via message group strategy keyed by entity identity.
- Delivery is at-least-once; consumers are expected to deduplicate by `eventId`.
- Temporary publish failures MUST be retried through managed retry/redrive.
- Exhausted retries MUST surface unresolved failure through operational signals (for example DLQ + alarms/logs).

## Security and IAM contract

- Pipe execution role MUST be least-privilege and resource-scoped.
- Stream read permissions: DynamoDB stream read actions on the table stream ARN only.
- Queue publish permissions: send/get attributes/url actions scoped to the target queue ARN only.
- No wildcard (`*`) resource scope unless a specific AWS API requires it and is documented.
