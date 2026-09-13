// API adapter for the scheduled-posts calendar — implements the
// src/calendar/adapter.js contract against mcp.slashloop.dev's /api/social
// routes. This is the ONLY app-coupled file in the calendar stack; the UI
// module stays portable.

import { apiFetch } from "./http.js";

export function createApiAdapter(accessToken) {
  return {
    async listIntegrations() {
      const data = await apiFetch("/api/social/integrations", { accessToken });
      return {
        integrations: data.integrations ?? [],
        configured: data.configured ?? ["tiktok", "youtube", "instagram"],
      };
    },

    async connectUrl(provider) {
      return apiFetch(`/api/social/integrations?connect=${encodeURIComponent(provider)}`, { method: "POST", accessToken });
    },

    async disconnect(id) {
      await apiFetch(`/api/social/integrations?id=${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
    },

    async listGroups(from, to) {
      const data = await apiFetch(`/api/social/posts?from=${from}&to=${to}`, { accessToken });
      return data.groups ?? [];
    },

    async createGroup(input) {
      return apiFetch("/api/social/posts", {
        method: "POST",
        accessToken,
        body: {
          integrationIds: input.integrationIds,
          content: input.content,
          media: input.media ?? [],
          publishDate: input.publishDate,
          settings: input.settings ?? {},
        },
      });
    },

    async rescheduleGroup(groupId, publishDate) {
      await apiFetch(`/api/social/posts?id=${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        accessToken,
        body: { publishDate },
      });
    },

    async deleteGroup(groupId) {
      await apiFetch(`/api/social/posts?id=${encodeURIComponent(groupId)}`, { method: "DELETE", accessToken });
    },
  };
}
