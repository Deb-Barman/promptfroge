// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../../core/Utils";

/** UIManager methods: groups. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const groupsMethods = {
  // memberIdOrIds: a single id (long-press/right-click on one card) or an
  // array of ids (bulk "Add to group" from Select mode). Both paths share
  // this one modal — the copy and the "current group" detection just adapt
  // to whether it's one card or several.
  openGroupPickerModal(kind, memberIdOrIds){
    const isBulk = Array.isArray(memberIdOrIds);
    const ids = isBulk ? memberIdOrIds : [memberIdOrIds];
    const groups = this.pe.listGroups(kind);
    // "Current group" only has a clean single answer for one card. For a
    // bulk selection it's ambiguous by nature (the cards could span several
    // groups or none) — so bulk mode never pre-highlights a group or offers
    // "remove from X", only "remove from any group" once at least one
    // selected card actually belongs to something.
    const current = isBulk ? null : this.pe.groupForMember(kind, ids[0]);
    const anyGrouped = isBulk && ids.some(id => this.pe.groupForMember(kind, id));
    const noun = ids.length === 1 ? "card" : `${ids.length} cards`;
    this.openModal({
      title: isBulk ? `Add ${noun} to Group` : "Add to Group",
      bodyHtml: `
        <div id="grpPickerList" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;margin-bottom:${groups.length ? 'var(--sp-3)' : '0'}">
          ${groups.length ? groups.map(g => `
            <button class="btn btn-ghost btn-block" data-grp-id="${g.id}" style="justify-content:flex-start;gap:8px;${current && current.id === g.id ? 'border-color:'+g.color+';background:color-mix(in srgb, '+g.color+' 12%, transparent)' : ''}">
              <span style="width:9px;height:9px;border-radius:50%;background:${g.color};flex-shrink:0"></span>
              <span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(g.name || "Untitled group")}</span>
              <span style="font-size:var(--fs-2xs);color:var(--text-tertiary)">${g.memberIds.length}</span>
              ${current && current.id === g.id ? `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="flex-shrink:0"><path d="M2.5 7 5.5 10 10.5 3" stroke="${g.color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
            </button>`).join("") : `<div style="font-size:var(--fs-xs);color:var(--text-tertiary);padding:4px 2px">No groups yet — create one below.</div>`}
        </div>
        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="grpNewNameInput">New group</label>
          <div style="display:flex;gap:8px">
            <input class="input" id="grpNewNameInput" placeholder="e.g. Client X prompts" maxlength="60" style="flex:1">
            <button class="btn btn-secondary" id="grpCreateBtn">Create</button>
          </div>
        </div>
        ${current ? `<button class="btn btn-ghost btn-sm btn-block" id="grpRemoveBtn" style="margin-top:var(--sp-3);color:var(--accent-red)">Remove from "${Utils.escapeHtml(current.name || 'group')}"</button>` : ""}
        ${isBulk && anyGrouped ? `<button class="btn btn-ghost btn-sm btn-block" id="grpRemoveBtn" style="margin-top:var(--sp-3);color:var(--accent-red)">Remove from group</button>` : ""}`,
      onMount: (modal) => {
        modal.querySelectorAll("[data-grp-id]").forEach(btn => {
          btn.addEventListener("click", async () => {
            if (isBulk) await this.pe.assignManyToGroup(kind, ids, btn.dataset.grpId);
            else await this.pe.assignToGroup(kind, ids[0], btn.dataset.grpId);
            this.closeModal();
            this.toast(isBulk ? `Added ${noun} to group.` : "Added to group.", "success", 1600);
            if (kind === "library" && isBulk) this.state.compare.selectedIds = [];
            this.renderView();
          });
        });
        const createBtn = modal.querySelector("#grpCreateBtn");
        const nameInput = modal.querySelector("#grpNewNameInput");
        const doCreate = async () => {
          const name = nameInput.value.trim();
          if (!name){ this.toast("Name the group first.", "warn"); return; }
          const group = this.pe.newGroupSkeleton(kind, { name });
          await this.pe.saveGroup(group);
          if (isBulk) await this.pe.assignManyToGroup(kind, ids, group.id);
          else await this.pe.assignToGroup(kind, ids[0], group.id);
          this.closeModal();
          this.toast(`Created "${name}" and added ${noun}.`, "success", 2000);
          if (kind === "library" && isBulk) this.state.compare.selectedIds = [];
          this.renderView();
        };
        createBtn.addEventListener("click", doCreate);
        nameInput.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); doCreate(); } });
        const removeBtn = modal.querySelector("#grpRemoveBtn");
        if (removeBtn){
          removeBtn.addEventListener("click", async () => {
            if (isBulk) await this.pe.removeManyFromAllGroups(kind, ids);
            else await this.pe.removeFromAllGroups(kind, ids[0]);
            this.closeModal();
            this.toast(isBulk ? "Removed from group." : "Removed from group.", "info", 1500);
            if (kind === "library" && isBulk) this.state.compare.selectedIds = [];
            this.renderView();
          });
        }
      }
    });
  },

  openManageGroupsModal(kind){
    const groups = this.pe.listGroups(kind);
    this.openModal({
      title: "Manage Groups",
      size: "modal-lg",
      bodyHtml: groups.length ? `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${groups.map(g => `
            <div class="card" style="display:flex;align-items:center;gap:10px;padding:10px 12px">
              <span style="width:11px;height:11px;border-radius:50%;background:${g.color};flex-shrink:0"></span>
              <input class="input" data-grp-rename="${g.id}" value="${Utils.escapeHtml(g.name)}" style="flex:1;min-width:0">
              <span style="font-size:var(--fs-2xs);color:var(--text-tertiary);flex-shrink:0">${g.memberIds.length} item${g.memberIds.length===1?'':'s'}</span>
              <button class="icon-btn btn-sm" data-grp-delete="${g.id}" title="Delete group" aria-label="Delete group">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>`).join("")}
        </div>
        <p style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:var(--sp-3)">Deleting a group removes the grouping only — the prompts, templates, or patterns in it are untouched.</p>`
        : `<p style="font-size:var(--fs-xs);color:var(--text-tertiary)">No groups yet. Long-press (or right-click) any card to create one.</p>`,
      footerHtml: `<button class="btn btn-primary" id="grpManageDoneBtn">Done</button>`,
      onMount: (modal) => {
        modal.querySelector("#grpManageDoneBtn").addEventListener("click", () => this.closeModal());
        modal.querySelectorAll("[data-grp-rename]").forEach(input => {
          const commit = Utils.debounce(async () => {
            const g = this.pe.getGroup(input.dataset.grpRename);
            if (!g) return;
            g.name = input.value;
            await this.pe.saveGroup(g);
            this.renderView();
          }, 400);
          input.addEventListener("input", commit);
        });
        modal.querySelectorAll("[data-grp-delete]").forEach(btn => {
          btn.addEventListener("click", () => {
            this.confirmDialog({ title: "Delete this group?", message: "The group chip will be removed from every card. This can't be undone.", danger: true, confirmLabel: "Delete", onConfirm: async () => {
              await this.pe.deleteGroup(btn.dataset.grpDelete);
              this.toast("Group deleted.", "info");
              this.closeModal();
              this.openManageGroupsModal(kind);
              this.renderView();
            }});
          });
        });
      }
    });
  }
};
