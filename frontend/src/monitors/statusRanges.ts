import type {
  StatusRange,
} from './types'


export function parseStatusRanges(
  input: string,
): StatusRange[] {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    throw new Error(
      'Enter at least one HTTP status or range.',
    )
  }

  if (parts.length > 20) {
    throw new Error(
      'Use no more than 20 status ranges.',
    )
  }

  const ranges = parts.map(
    (part): StatusRange => {
      const match = part.match(
        /^(\d{3})(?:\s*-\s*(\d{3}))?$/,
      )

      if (!match) {
        throw new Error(
          `Invalid HTTP status range: ${part}`,
        )
      }

      const min = Number(match[1])
      const max = Number(
        match[2] ?? match[1],
      )

      if (
        min < 100 ||
        min > 599 ||
        max < 100 ||
        max > 599
      ) {
        throw new Error(
          'HTTP status codes must be between 100 and 599.',
        )
      }

      if (min > max) {
        throw new Error(
          `Invalid HTTP status range: ${part}`,
        )
      }

      return {
        min,
        max,
      }
    },
  )

  ranges.sort(
    (a, b) => a.min - b.min,
  )

  for (
    let index = 1;
    index < ranges.length;
    index += 1
  ) {
    if (
      ranges[index].min
      <= ranges[index - 1].max
    ) {
      throw new Error(
        'HTTP status ranges cannot overlap.',
      )
    }
  }

  return ranges
}


export function formatStatusRanges(
  ranges: StatusRange[],
): string {
  return ranges
    .map(({ min, max }) => (
      min === max
        ? String(min)
        : `${min}-${max}`
    ))
    .join(', ')
}