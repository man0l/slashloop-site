// Reusable social-post calendar — data contract.
//
// The UI in this folder (CalendarView, ScheduleDrawer) is app-agnostic: it
// renders whatever its `adapter` provides and calls it on every mutation.
// Reuse = copy the folder (or publish it) + implement the five adapter
// methods; nothing here imports app state, auth, or the API client.
//
// Group shape (matches GET /api/social/posts on mcp.slashloop.dev):
//   { groupId, publishDate,   // epoch seconds, UTC
//     content, media: [{type, url, alt?, thumbnail?}],
//     state: 'queued' | 'processing' | 'published' | 'error',
//     posts: [{ id, provider, state, releaseUrl, error }] }
// Integration shape: { id, provider, name, profile, picture, needsReconnect }.
// listIntegrations() resolves { integrations, configured } — `configured`
// lists the providers this deployment has app credentials for; hosts hide
// connect buttons for the rest.

/**
 * @typedef {Object} CalendarAdapter
 * @property {() => Promise<Array>} listIntegrations
 * @property {(provider: string) => Promise<{ url: string }>} connectUrl
 *           Returns the platform consent-screen URL (the browser then
 *           navigates there; the OAuth callback bounces back to the app).
 * @property {(id: string) => Promise<void>} disconnect
 * @property {(from: number, to: number) => Promise<Array>} listGroups
 *           Epoch-seconds range, inclusive.
 * @property {(input: { integrationIds: string[], content: string,
 *            media: Array, publishDate: number,
 *            settings?: Object }) => Promise<{ groupId: string }>} createGroup
 * @property {(groupId: string, publishDate: number) => Promise<void>} rescheduleGroup
 *           Must reject with an Error carrying `.status === 409` when the
 *           group is mid-publish.
 * @property {(groupId: string) => Promise<void>} deleteGroup
 */

/**
 * In-memory adapter for tests, Storybook-style demos, and offline dev.
 * Backs the same contract as src/lib/social.js's API adapter.
 */
export function createMockAdapter(seed = {}) {
  const integrations = (seed.integrations ?? [
    { id: "tt-1", provider: "tiktok", name: "Demo TikTok", profile: "demo", picture: "", needsReconnect: false },
    { id: "yt-1", provider: "youtube", name: "Demo YouTube", profile: "demo", picture: "", needsReconnect: false },
  ]).map((row) => ({ ...row }));
  const groups = (seed.groups ?? []).map((group) => ({ ...group, posts: group.posts.map((p) => ({ ...p })) }));

  return {
    async listIntegrations() {
      return {
        integrations: integrations.map((row) => ({ ...row })),
        configured: ["tiktok", "youtube", "instagram"],
      };
    },
    async connectUrl(provider) {
      return { url: `https://example.com/oauth/${provider}` };
    },
    async disconnect(id) {
      const index = integrations.findIndex((row) => row.id === id);
      if (index >= 0) integrations.splice(index, 1);
    },
    async listGroups(from, to) {
      return groups.filter((group) => group.publishDate >= from && group.publishDate <= to).map(cloneGroup);
    },
    async createGroup(input) {
      const groupId = `mock-${Math.random().toString(36).slice(2)}`;
      const group = {
        groupId,
        publishDate: input.publishDate,
        content: input.content,
        media: input.media ?? [],
        state: "queued",
        posts: input.integrationIds.map((id) => {
          const integration = integrations.find((row) => row.id === id);
          return { id: `${groupId}-${id}`, provider: integration?.provider ?? id, state: "QUEUE", releaseUrl: null, error: null };
        }),
      };
      groups.push(group);
      return { groupId };
    },
    async rescheduleGroup(groupId, publishDate) {
      const group = groups.find((row) => row.groupId === groupId);
      if (!group) throw new Error("not found");
      if (group.state === "processing") {
        const error = new Error("processing");
        error.status = 409;
        throw error;
      }
      group.publishDate = publishDate;
    },
    async deleteGroup(groupId) {
      const index = groups.findIndex((row) => row.groupId === groupId);
      if (index >= 0) groups.splice(index, 1);
    },
  };
}

function cloneGroup(group) {
  return { ...group, media: (group.media ?? []).map((m) => ({ ...m })), posts: group.posts.map((p) => ({ ...p })) };
}
