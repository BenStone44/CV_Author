const builtInGraphLinkCandidate = /^builtin-template:graph-link(?:-|$)/;

/** Identify whole-map Graph Link drops without relying only on a reactive UI update. */
export function isGraphLinkTemplateDrag(
  dataTransfer: Pick<DataTransfer, "getData"> | null | undefined,
  activeGraphLinkDrag = false,
) {
  if (activeGraphLinkDrag) return true;
  if (!dataTransfer) return false;
  try {
    const candidateId = dataTransfer.getData("application/x-svg-candidate")
      || dataTransfer.getData("text/plain");
    return builtInGraphLinkCandidate.test(candidateId);
  }
  catch {
    // Browsers may hide drag payloads until drop; the reactive flag remains
    // the authoritative fallback during dragover in that case.
    return false;
  }
}
