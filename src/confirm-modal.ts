// confirm-modal.ts - a minimal yes/no confirmation, for an action that edits
// files in bulk (the vault-wide safe-fix), so a batch write is never applied
// without an explicit second click.
import { App, Modal } from "obsidian";

export class ConfirmModal extends Modal {
  private message: string;
  private confirmLabel: string;
  private onConfirm: () => void;

  constructor(app: App, message: string, confirmLabel: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.confirmLabel = confirmLabel;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });
    const buttons = contentEl.createDiv({ cls: "lokf-confirm-buttons" });
    const confirm = buttons.createEl("button", { cls: "mod-cta", text: this.confirmLabel });
    confirm.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
