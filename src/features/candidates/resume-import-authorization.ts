export type ResumeImportAccount = {
  status: string;
};

export function canImportResume(
  account: ResumeImportAccount | null,
): account is ResumeImportAccount & { status: "active" } {
  return account?.status === "active";
}
