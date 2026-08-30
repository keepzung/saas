import { defineStore } from 'pinia';
import {
  getFolders,
  getWorkspace,
  getMembers,
} from '../api/project';

export const useProjectStore = defineStore('project', {
  state: () => ({
    workspace: null,
    folders: [],
    members: [],
    currentFolderId: null,
    loaded: false,
  }),

  actions: {
    async loadWorkspace(brandId) {
      this.workspace = await getWorkspace(
        brandId ? { brandId } : undefined,
      );
      return this.workspace;
    },

    async loadFolders(brandId) {
      this.folders = await getFolders(brandId ? { brandId } : undefined);
      return this.folders;
    },

    async loadMembers() {
      const data = await getMembers();
      this.members = data.list ?? [];
      return this.members;
    },

    async init(brandId) {
      await Promise.all([
        this.loadWorkspace(brandId),
        this.loadFolders(brandId),
        this.loadMembers(),
      ]);
      this.loaded = true;
    },

    async refreshFolders(brandId) {
      await this.loadFolders(brandId);
    },
  },
});
