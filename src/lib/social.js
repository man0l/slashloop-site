// API adapter for the scheduled-posts calendar — implements the
// src/calendar/adapter.js contract against mcp.slashloop.dev's /api/social
// routes. This is the ONLY app-coupled file in the calendar stack; the UI
// module stays portable.

import { apiFetch } from "./http.js";

const MCP_URL = (import.meta.env.VITE_MCP_URL ?? "").replace(/\/$/, "");

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
      return { groups: data.groups ?? [], drafts: data.drafts ?? [] };
    },

    /** apiFetch JSON-stringifies bodies, so multipart goes through raw fetch.
     *  The worker answers { url, type } — url is the stable public /thumbs
     *  link platforms pull later. */
    async uploadMedia(file) {
      if (!MCP_URL) throw new Error("VITE_MCP_URL is not set.");
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${MCP_URL}/api/social/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) {
        let detail = "";
        try {
          detail = (await res.json())?.error ?? "";
        } catch {
          /* not JSON */
        }
        const message =
          detail === "too_large"
            ? "That file is too large — images up to 20 MB, videos up to 95 MB."
            : detail === "unsupported_type"
              ? "Only JPG / PNG / WebP images and MP4 / MOV videos are supported."
              : detail || `Upload failed (${res.status}).`;
        const err = new Error(message);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },

    async createGroup(input) {
      return apiFetch("/api/social/posts", {
        method: "POST",
        accessToken,
        body: {
          integrationIds: input.integrationIds,
          content: input.content,
          media: input.media ?? [],
          ...(input.publishDate !== undefined ? { publishDate: input.publishDate } : {}),
          ...(input.draft ? { draft: true } : {}),
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

    async updateGroup(groupId, input) {
      await apiFetch(`/api/social/posts?id=${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        accessToken,
        body: { content: input.content, media: input.media },
      });
    },

    async scheduleDraft(groupId, publishDate) {
      await apiFetch(`/api/social/posts?id=${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        accessToken,
        body: { state: "QUEUE", publishDate },
      });
    },

    async deleteGroup(groupId) {
      await apiFetch(`/api/social/posts?id=${encodeURIComponent(groupId)}`, { method: "DELETE", accessToken });
    },
  };
}
