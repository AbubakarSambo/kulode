import posthog from 'posthog-js'
import type { Organization, User } from '@/types'

const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

if (key) {
  posthog.init(key, {
    api_host: host,
    // 'history_change' also records a pageview on every in-app route change. With plain `true`
    // only the first page load of a visit counted, which leaves a single-page app like this one
    // looking as if nobody ever leaves the page they landed on.
    capture_pageview: 'history_change',
    capture_pageleave: true,
    // Enable cross-domain session stitching.
    // When a user arrives from tarione.com with ?__phsid=<id>,
    // PostHog resumes the same session started on the marketing site.
    // This connects the marketing funnel to the app funnel in one journey.
    cross_subdomain_cookie: false,
  })
}

/**
 * Tells PostHog which restaurant, plan and role the person belongs to, so every event can be
 * sliced by them and grouped per organization ("which restaurants closed orders this week").
 *
 * - `register` stamps the properties onto every later event from this browser.
 * - `group('organization', id)` is what powers per-restaurant (group) analytics, including the
 *   server-side events the API sends for the same organization.
 * - Person properties carry plan and signup date for cohorts and retention.
 *
 * A platform admin's read-only "View as" session is only flagged, never attributed to the
 * customer's organization, so a support session can't inflate that restaurant's usage.
 * `org` (the full organization record) is optional: it arrives a moment after login.
 */
export function setAnalyticsContext(user: User, org?: Organization & { isDemo?: boolean; isTestAccount?: boolean; wentLiveAt?: string | null }) {
  if (!key) return
  const impersonating = !!user.impersonation
  if (impersonating) {
    posthog.register({ impersonating: true, impersonated_organization_id: user.organizationId })
    return
  }

  const plan = user.plan
  const userOrg = user.organization
  const orgProps = {
    organization_id: user.organizationId,
    plan_tier: plan?.planTier,
    subscription_status: plan?.subscriptionStatus,
    pos_mode: userOrg?.posMode,
    business_type: userOrg?.businessType,
    organization_size: userOrg?.organizationSize,
    is_demo: org?.isDemo ?? false,
    is_test_account: org?.isTestAccount ?? false,
  }
  posthog.register({
    ...orgProps,
    impersonating: false,
    roles: user.roles,
    app_env: import.meta.env.MODE,
  })
  posthog.group('organization', user.organizationId, {
    name: user.organizationName,
    ...orgProps,
    trial_end_date: plan?.trialEndDate,
    is_grandfathered: plan?.isGrandfathered,
    currency: org?.currency,
    went_live: !!org?.wentLiveAt,
    created_at: org?.createdAt,
  })
  posthog.setPersonProperties(
    { ...orgProps, roles: user.roles, organization_name: user.organizationName },
    org?.createdAt ? { organization_created_at: org.createdAt } : undefined,
  )
}

export { posthog }
