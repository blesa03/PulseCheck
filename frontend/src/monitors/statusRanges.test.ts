import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  formatStatusRanges,
  parseStatusRanges,
} from './statusRanges'


describe('HTTP status ranges', () => {
  it(
    'parses ranges and individual status codes',
    () => {
      expect(
        parseStatusRanges(
          '200-204, 301, 404',
        ),
      ).toEqual([
        {
          min: 200,
          max: 204,
        },
        {
          min: 301,
          max: 301,
        },
        {
          min: 404,
          max: 404,
        },
      ])
    },
  )

  it(
    'rejects overlapping ranges',
    () => {
      expect(() => (
        parseStatusRanges(
          '200-299, 250-399',
        )
      )).toThrow(
        'HTTP status ranges cannot overlap.',
      )
    },
  )

  it(
    'rejects invalid HTTP status codes',
    () => {
        expect(() => (
        parseStatusRanges(
            '600, 200',
        )
        )).toThrow(
        'HTTP status codes must be between 100 and 599.',
        )
    },
  )

  it(
    'formats ranges for editing',
    () => {
      expect(
        formatStatusRanges([
          {
            min: 200,
            max: 399,
          },
          {
            min: 404,
            max: 404,
          },
        ]),
      ).toBe(
        '200-399, 404',
      )
    },
  )
})