import posthog from 'posthog-js'

const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

if (key) {
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    // Enable cross-domain session stitching.
    // When a user arrives from tarione.com with ?__phsid=<id>,
    // PostHog resumes the same session started on the marketing site.
    // This connects the marketing funnel to the app funnel in one journey.
    cross_subdomain_cookie: false,
  })
}

export { posthog }
