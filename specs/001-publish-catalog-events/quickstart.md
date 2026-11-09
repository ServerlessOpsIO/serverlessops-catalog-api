# Quickstart: Validate Catalog Event Publication

This guide validates end-to-end behavior for publishing catalog mutation events through DynamoDB Stream -> EventBridge Pipe -> SQS FIFO.

## Prerequisites

- AWS credentials for the target account/environment.
- Existing SQS FIFO queue and DLQ already provisioned (outside this feature scope).
- SSM parameters present for queue discovery:
  - `/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueName`
  - `/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueUrl`
- The SSM parameter `/platform/backstage/backstage-app/main/SqsQueueArn` is available to resolve the `SqsQueueArn` CloudFormation parameter.
- SAM CLI, Node.js, and Yarn available locally.

## 1) Validate schema and infrastructure definitions

Run from repository root:

```bash
yarn install
yarn test
sam validate --lint
```

Expected outcome:
- Unit tests pass.
- SAM template and OpenAPI validations pass.

## 2) Build and deploy the stack

```bash
yarn sam:build
yarn sam:deploy
```

Expected outcome:
- Stack update succeeds.
- DynamoDB table stream and EventBridge Pipe resources are active.

## 3) Confirm queue discovery parameters

```bash
aws ssm get-parameter --name "/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueName"
aws ssm get-parameter --name "/${Domain}/${System}/${Component}/${CodeBranch}/SqsQueueUrl"
```

Expected outcome:
- Both parameters exist and refer to the same FIFO queue.
- The resolved `SqsQueueArn` refers to that same queue.

## 4) Exercise create/update/delete mutations

Using a test entity, invoke the create endpoint, update/upsert it, and then delete it.

Expected outcome:
- Each committed mutation produces one matching event: `create`, `update`, then `delete`.
- Create and update events contain the DynamoDB `NewImage`; delete events contain `OldImage`.
- `entityRef` matches the entity's persisted DynamoDB sort key.
- Internal table rows with an `itemType` other than `entity` do not produce events.
- FIFO message group IDs use the persisted entity sort key, preserving per-entity ordering.

## 5) Inspect SQS messages and validate contract

Read queue messages and inspect the stream-derived payload:
- `eventId` remains stable for retries of the same stream record.
- `changeType` maps to the DynamoDB stream operation.
- `entity` contains DynamoDB AttributeValue data from the appropriate stream image.

Expected outcome per message:
- Contains `eventId`, `changeType`, `entityRef`, `entity`.
- `entityRef` matches the identity fields in the typed DynamoDB image.
- The consumer unmarshals the image and removes the table-only `pk`, `sk`, and `itemType` fields before processing the Backstage entity.

## 6) Validate ordering and deduplication behavior

Execute rapid sequential updates for the same entity.

Expected outcome:
- Events are delivered in per-entity FIFO order.
- Re-deliveries (if any) retain same `eventId` for the same logical change.
- Consumers can deduplicate duplicate deliveries by `eventId`.

## 7) Validate failure visibility path

Introduce a controlled publish failure (for example queue policy deny or transient destination disruption) and restore afterward.

Expected outcome:
- Mutation remains committed.
- Delivery retries occur automatically.
- Unresolved failures are visible via DLQ/alarm/log operational signals.

## References

- Data model: `specs/001-publish-catalog-events/data-model.md`
- Publication contract: `specs/001-publish-catalog-events/contracts/event-publication-contract.md`
- Consumer reference spec: `ServerlessOpsIO/backstage-app/specs/010-catalog-event-updates`
