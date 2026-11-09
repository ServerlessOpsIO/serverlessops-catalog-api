import { describe, expect, it } from '@jest/globals'
import {
  getSamResource,
  getSamResourcesByType,
  loadSamTemplate,
} from '../../support/template-resource-loader.js'

describe('catalog event pipes', () => {
  const template = loadSamTemplate()

  it('enables a stream with both images on the entity table', () => {
    const table = getSamResource(template, 'DdbTable')

    expect(table.Properties?.StreamSpecification).toEqual({
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    })
  })

  it('connects each mutation pipe to the table stream and configured FIFO queue', () => {
    const pipes = getSamResourcesByType(template, 'AWS::Pipes::Pipe')

    expect(pipes).toHaveLength(3)

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
})
