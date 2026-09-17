// Reusable social-post calendar — data contract.
//
// The UI in this folder (CalendarView, ScheduleDrawer) is app-agnostic: it
// renders whatever its `adapter` provides and calls it on every mutation.
// Reuse = copy the folder (or publish it) + implement the adapter methods;
// nothing here imports app state, auth, or the API client.
//
// Group shape (matches GET /api/social/posts on mcp.slashloop.dev):
//   { groupId, publishDate,   // epoch seconds, UTC — 0 for undated drafts
//     content, media: [{type, url, alt?, thumbnail?}],
//     state: 'queued' | 'processing' | 'published' | 'error' | 'draft',
//     posts: [{ id, provider, state, releaseUrl, error }] }
// Integration shape: { id, provider, name, profile, picture, needsReconnect }.
// listGroups() resolves { groups, drafts } — `drafts` lists every draft group
// (dated or not) so the calendar can show an "N drafts" strip. `configured`
// lists the providers this deployment has app credentials for; hosts hide
// connect buttons for the rest.

/**
 * @typedef {Object} CalendarAdapter
 * @property {() => Promise<{ integrations: Array, configured: string[] }>} listIntegrations
 * @property {(provider: string) => Promise<{ url: string }>} connectUrl
 *           Returns the platform consent-screen URL (the browser then
 *           navigates there; the OAuth callback bounces back to the app).
 * @property {(id: string) => Promise<void>} disconnect
 * @property {(from: number, to: number) => Promise<{ groups: Array, drafts: Array }>} listGroups
 *           Epoch-seconds range, inclusive.
 * @property {(file: File) => Promise<{ url: string, type: string }>} uploadMedia
 *           Moves a picked file to durable storage and returns its public URL.
 * @property {(input: { integrationIds: string[], content: string,
 *            media: Array, publishDate?: number, draft?: boolean,
 *            settings?: Object }) => Promise<{ groupId: string, posts: number,
 *            publishDate: number, draft?: boolean, skipped?: Array }>} createGroup
 * @property {(groupId: string, publishDate: number) => Promise<void>} rescheduleGroup
 *           Must reject with an Error carrying `.status === 409` when the
 *           group is mid-publish.
 * @property {(groupId: string, input: { content: string, media: Array }) => Promise<void>} updateGroup
 *           Caption + media update — drafts and queued groups only.
 * @property {(groupId: string, publishDate: number) => Promise<void>} scheduleDraft
 *           DRAFT → queued with a publish date.
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
  const groups = (seed.groups ?? []).map(cloneGroup);
  const drafts = (seed.drafts ?? []).map(cloneGroup);

  let uploadCount = 0;

  return {
    async listIntegrations() {
      return { integrations: integrations.map((row) => ({ ...row })), configured: ["tiktok", "youtube", "instagram"] };
    },
    async connectUrl(provider) {
      return { url: `https://example.com/oauth/${provider}` };
    },
    async disconnect(id) {
      const index = integrations.findIndex((row) => row.id === id);
      if (index >= 0) integrations.splice(index, 1);
    },
    async listGroups(from, to) {
      return {
        groups: groups.filter((group) => group.publishDate >= from && group.publishDate <= to).map(cloneGroup),
        drafts: drafts.map(cloneGroup),
      };
    },
    async uploadMedia(file) {
      uploadCount += 1;
      const name = file?.name ?? `upload-${uploadCount}`;
      return { url: `https://cdn.example/social/${uploadCount}-${name}`, type: "image" };
    },
    async createGroup(input) {
      const groupId = `mock-${Math.random().toString(36).slice(2)}`;
      const target = input.draft ? drafts : groups;
      const group = {
        groupId,
        publishDate: input.publishDate ?? 0,
        content: input.content,
        media: (input.media ?? []).map((m) => ({ ...m, ...(input.stripMetadata ? { scrub: true } : {}) })),
        state: input.draft ? "draft" : input.stripMetadata ? "scrubbing" : "queued",
        posts: input.integrationIds.map((id) => {
          const integration = integrations.find((row) => row.id === id);
          return { id: `${groupId}-${id}`, provider: integration?.provider ?? id, state: input.draft ? "DRAFT" : "QUEUE", releaseUrl: null, error: null };
        }),
      };
      target.push(group);
      return { groupId, posts: group.posts.length, publishDate: group.publishDate, draft: Boolean(input.draft), skipped: [] };
    },
    async rescheduleGroup(groupId, publishDate) {
      const group = groups.concat(drafts).find((row) => row.groupId === groupId);
      if (!group) throw new Error("not found");
      if (group.state === "processing") {
        const error = new Error("processing");
        error.status = 409;
        throw error;
      }
      group.publishDate = publishDate;
    },
    async updateGroup(groupId, input) {
      const group = groups.concat(drafts).find((row) => row.groupId === groupId);
      if (!group) throw new Error("not found");
      group.content = input.content;
      group.media = input.media.map((m) => ({ ...m }));
    },
    async scheduleDraft(groupId, publishDate, opts = {}) {
      const index = drafts.findIndex((row) => row.groupId === groupId);
      if (index < 0) throw new Error("not found");
      const [group] = drafts.splice(index, 1);
      if (opts.stripMetadata) {
        group.media = group.media.map((m) => ({ ...m, scrub: true }));
        group.state = "scrubbing";
      } else {
        group.state = "queued";
      }
      group.publishDate = publishDate;
      group.posts.forEach((post) => (post.state = "QUEUE"));
      groups.push(group);
    },
    async deleteGroup(groupId) {
      let index = groups.findIndex((row) => row.groupId === groupId);
      if (index >= 0) groups.splice(index, 1);
      index = drafts.findIndex((row) => row.groupId === groupId);
      if (index >= 0) drafts.splice(index, 1);
    },
  };
}

function cloneGroup(group) {
  return { ...group, media: (group.media ?? []).map((m) => ({ ...m })), posts: group.posts.map((p) => ({ ...p })) };
}
