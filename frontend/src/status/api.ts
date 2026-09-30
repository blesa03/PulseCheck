import {
  ApiError,
  apiFetch,
  publicApiFetch,
  readApiErrorMessage,
} from '../api/client'

import type {
  PublicStatusPayload,
  StatusPageConfig,
  StatusPageUpdate,
} from './types'


async function readResponse<T>(
  response: Response,
): Promise<T> {
  if (!response.ok) {
    throw new ApiError(
      await readApiErrorMessage(
        response,
      ),
      response.status,
    )
  }

  return await response.json() as T
}


export async function getStatusPageConfig() {
  const response = await apiFetch(
    '/status-page/',
  )

  return readResponse<
    StatusPageConfig
  >(response)
}


export async function updateStatusPageConfig(
  payload: StatusPageUpdate,
) {
  const response = await apiFetch(
    '/status-page/',
    {
      method: 'PATCH',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(
        payload,
      ),
    },
  )

  return readResponse<
    StatusPageConfig
  >(response)
}


export async function getPublicStatusPage(
  slug: string,
) {
  const response =
    await publicApiFetch(
      (
        '/public/status/'
        + `${encodeURIComponent(slug)}/`
      ),
    )

  return readResponse<
    PublicStatusPayload
  >(response)
}