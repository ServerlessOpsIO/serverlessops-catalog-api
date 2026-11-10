import { describe, expect, it } from '@jest/globals'
import {
  getSamResource,
  getSamResourcesByType,
  loadSamTemplate,
} from '../../support/template-resource-loader.js'

const MUTATION_PIPE_IDS = [
  'CatalogEventInsertPipe',
  'CatalogEventModifyPipe',
  'CatalogEventRemovePipe',
]

describe('catalog event pipes', () => {
  const template = loadSamTemplate()
  const getMutationPipes = () =>
    MUTATION_PIPE_IDS.map(
      logicalId => [logicalId, getSamResource(template, logicalId)] as const,
    )

  it('enables a stream with both images on the entity table', () => {
    const table = getSamResource(template, 'DdbTable')

    expect(table.Properties?.StreamSpecification).toEqual({
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    })
  })

  it('connects each mutation pipe to the table stream and configured FIFO queue', () => {
    const pipes = getMutationPipes()
    const queuePipeIds = getSamResourcesByType(template, 'AWS::Pipes::Pipe')
      .filter(([, pipe]) => {
        const target = pipe.Properties?.Target as { Ref?: string } | undefined
        return target?.Ref === 'SqsQueueArn'
      })
      .map(([logicalId]) => logicalId)

    expect(queuePipeIds.sort()).toEqual([...MUTATION_PIPE_IDS].sort())

    for (const [, pipe] of pipes) {
      expect(pipe.Properties).toEqual(
        expect.objectContaining({
          Source: { 'Fn::GetAtt': ['DdbTable', 'StreamArn'] },
          Target: { Ref: 'SqsQueueArn' },
          RoleArn: { 'Fn::GetAtt': ['CatalogEventPipeRole', 'Arn'] },
        }),
      )
    }
  })

  it('resolves the target ARN from the consumer queue SSM parameter', () => {
    const parameter = template.Parameters?.SqsQueueArn
    const pipes = getMutationPipes()

    expect(parameter).toEqual(
      {
        Type: 'AWS::SSM::Parameter::Value<String>',
        Default: '/platform/backstage/backstage-app/main/SqsQueueArn',
        Description: 'ARN of the Backstage catalog events FIFO queue',
      },
    )
    expect(pipes.map(([, pipe]) => pipe.Properties?.Target)).toEqual(
      pipes.map(() => ({ Ref: 'SqsQueueArn' })),
    )
  })

  it('configures bounded retries and a source failure queue for every pipe', () => {
    const failureQueue = getSamResource(template, 'CatalogEventPipeFailureQueue')
    const pipes = getMutationPipes()
    const role = getSamResource(template, 'CatalogEventPipeRole')
    const alarm = getSamResource(template, 'CatalogEventPipeFailureAlarm')

    expect(failureQueue).toEqual(
      expect.objectContaining({
        Type: 'AWS::SQS::Queue',
        Properties: expect.objectContaining({
          MessageRetentionPeriod: 1209600,
          SqsManagedSseEnabled: true,
        }),
      }),
    )

    expect(role.Properties?.Policies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          PolicyDocument: expect.objectContaining({
            Statement: expect.arrayContaining([
              expect.objectContaining({
                Action: ['sqs:SendMessage'],
                Resource: { 'Fn::GetAtt': ['CatalogEventPipeFailureQueue', 'Arn'] },
              }),
            ]),
          }),
        }),
      ]),
    )

    for (const [, pipe] of pipes) {
      expect(pipe.Properties?.SourceParameters).toEqual(
        expect.objectContaining({
          DynamoDBStreamParameters: expect.objectContaining({
            MaximumRecordAgeInSeconds: 86400,
            MaximumRetryAttempts: 5,
            DeadLetterConfig: {
              Arn: { 'Fn::GetAtt': ['CatalogEventPipeFailureQueue', 'Arn'] },
            },
          }),
        }),
      )
    }

    const alarmDescription = alarm.Properties?.AlarmDescription as {
      'Fn::Sub': string
    }
    expect(alarmDescription['Fn::Sub']).toContain('CatalogEventPipeFailureQueue')
    expect(alarmDescription['Fn::Sub']).toContain('eventID')
    expect(alarmDescription['Fn::Sub']).toContain('dynamodb.Keys.sk.S')
    expect(template.Outputs?.CatalogEventPipeFailureQueueArn).toEqual({
      Description:
        'ARN of the queue containing catalog stream records that exhausted Pipe retries',
      Value: { 'Fn::GetAtt': ['CatalogEventPipeFailureQueue', 'Arn'] },
    })
  })

  it.each([
    ['CatalogEventInsertPipe', 'INSERT', 'create', 'NewImage'],
    ['CatalogEventModifyPipe', 'MODIFY', 'update', 'NewImage'],
    ['CatalogEventRemovePipe', 'REMOVE', 'delete', 'OldImage'],
  ])('maps %s records to %s events from entity items', (
    logicalId,
    streamEvent,
    changeType,
    image,
  ) => {
    const pipe = getSamResource(template, logicalId)

    expect(pipe.Properties?.SourceParameters).toEqual(
      expect.objectContaining({
        FilterCriteria: {
          Filters: [
            {
              Pattern: `{"eventName":["${streamEvent}"],"dynamodb":{"${image}":{"itemType":{"S":["entity"]}}}}`,
            },
          ],
        },
      }),
    )
    expect(pipe.Properties?.TargetParameters).toEqual(
      expect.objectContaining({
        SqsQueueParameters: {
          MessageGroupId: '$.dynamodb.Keys.sk.S',
          MessageDeduplicationId: '$.eventID',
        },
        InputTemplate: expect.stringContaining(
          `"entity": <$.dynamodb.${image}>`,
        ),
      }),
    )
    expect(pipe.Properties?.TargetParameters).toEqual(
      expect.objectContaining({
        InputTemplate: expect.stringContaining(`"changeType": "${changeType}"`),
      }),
    )
    expect(pipe.Properties?.TargetParameters).toEqual(
      expect.objectContaining({
        InputTemplate: expect.stringContaining('"eventId": "<$.eventID>"'),
      }),
    )
    expect(pipe.Properties?.TargetParameters).toEqual(
      expect.objectContaining({
        InputTemplate: expect.stringContaining('"entityRef": "<$.dynamodb.Keys.sk.S>"'),
      }),
    )
    expect(pipe.Properties?.TargetParameters).toEqual(
      expect.objectContaining({
        InputTemplate: expect.stringContaining('"schemaVersion": "1"'),
      }),
    )
  })

  it('logs every stream record to a dedicated log group without touching the catalog queue', () => {
    const pipe = getSamResource(template, 'CatalogEventLogPipe')
    const role = getSamResource(template, 'CatalogEventLogPipeRole')

    expect(pipe.Properties).toEqual(
      expect.objectContaining({
        Source: { 'Fn::GetAtt': ['DdbTable', 'StreamArn'] },
        Target: {
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:${CatalogEventStreamLogGroup}',
        },
        RoleArn: { 'Fn::GetAtt': ['CatalogEventLogPipeRole', 'Arn'] },
        TargetParameters: {
          CloudWatchLogsParameters: {
            LogStreamName: { Ref: 'CatalogEventStreamLogStream' },
          },
        },
      }),
    )
    expect(pipe.Properties?.SourceParameters).not.toHaveProperty('FilterCriteria')
    expect(pipe.Properties?.SourceParameters).toEqual({
      DynamoDBStreamParameters: expect.not.objectContaining({
        DeadLetterConfig: expect.anything(),
      }),
    })

    const statements = (
      role.Properties?.Policies as Array<{
        PolicyDocument: { Statement: Array<{ Action: string[]; Resource: unknown }> }
      }>
    ).flatMap(policy => policy.PolicyDocument.Statement)
    expect(statements.flatMap(statement => statement.Action)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^sqs:/)]),
    )
    expect(statements).toEqual(
      expect.arrayContaining([
        {
          Effect: 'Allow',
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: { 'Fn::Sub': '${CatalogEventStreamLogGroup.Arn}:*' },
        },
      ]),
    )
  })
})
