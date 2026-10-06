'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { clearDraft, computeDraftKey, loadDraft, saveDraft } from '@/lib/editor-drafts';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  InsertTable,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  MDXEditor,
  markdownShortcutPlugin,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  imagePlugin,
  InsertImage,
} from '@mdxeditor/editor';

interface MdxEditorClientProps {
  markdown: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function isSafeEditorUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  // Block script-like URLs but allow standard markdown link targets.
  return !/^(javascript|vbscript|data):/i.test(url);
}

export function MdxEditorClient({ markdown, onChange, placeholder }: MdxEditorClientProps) {
  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
      codeMirrorPlugin({ codeBlockLanguages: { text: 'Text' } }),  
      linkPlugin({ validateUrl: isSafeEditorUrl }),
      linkDialogPlugin(),
      imagePlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarClassName: 'shr-mdxeditor-toolbar',
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <ListsToggle options={['bullet', 'number']} />
            <Separator />
            <InsertTable />
            <Separator />
            <CreateLink />
            <InsertImage />
          </>
        ),
      }),
    ],
    []
  );

  // Recovery draft: keyed by page + field, derived from the markdown the
  // editor started with, so accidental ESC/navigation doesn't lose edits.
  const pathname = usePathname();
  const [initialMarkdown] = useState(markdown);
  const draftKey = useMemo(
    () => computeDraftKey(pathname ?? '', placeholder, initialMarkdown),
    [pathname, placeholder, initialMarkdown]
  );
  const [pendingDraft, setPendingDraft] = useState<{ content: string; updatedAt: number } | null>(
    null
  );
  const [restoreVersion, setRestoreVersion] = useState(0);
  const latestMarkdownRef = useRef(markdown);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const draft = loadDraft(draftKey);
    const isRecoverable =
      !!draft && draft.content.trim() !== '' && draft.content.trim() !== initialMarkdown.trim();
    // One-time read of an external system (localStorage) on mount, not a reactive sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingDraft(isRecoverable ? draft : null);
  }, [draftKey, initialMarkdown]);

  const flushDraftSave = useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const content = latestMarkdownRef.current;
    if (content.trim() === '' || content.trim() === initialMarkdown.trim()) return;
    saveDraft(draftKey, content);
  }, [draftKey, initialMarkdown]);

  useEffect(() => {
    const handleFlush = () => flushDraftSave();
    document.addEventListener('visibilitychange', handleFlush);
    window.addEventListener('pagehide', handleFlush);
    return () => {
      document.removeEventListener('visibilitychange', handleFlush);
      window.removeEventListener('pagehide', handleFlush);
      if (saveTimeoutRef.current !== null) clearTimeout(saveTimeoutRef.current);
    };
  }, [flushDraftSave]);

  const handleChange = useCallback(
    (nextMarkdown: string) => {
      onChange(nextMarkdown);
      latestMarkdownRef.current = nextMarkdown;
      if (saveTimeoutRef.current !== null) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        saveDraft(draftKey, latestMarkdownRef.current);
      }, 600);
    },
    [onChange, draftKey]
  );

  function handleRestoreDraft() {
    if (!pendingDraft) return;
    onChange(pendingDraft.content);
    latestMarkdownRef.current = pendingDraft.content;
    setRestoreVersion((v) => v + 1);
    setPendingDraft(null);
  }

  function handleDiscardDraft() {
    clearDraft(draftKey);
    setPendingDraft(null);
  }

  // Popups (link dialog, etc.) must render inside the enclosing native <dialog>,
  // otherwise the backdrop's top-layer stacking hides them.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setOverlayContainer(wrapperRef.current?.closest('dialog') ?? document.body);
  }, []);

  return (
    <div ref={wrapperRef}>
      {pendingDraft && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            You have an unsaved draft from {new Date(pendingDraft.updatedAt).toLocaleString()}.
          </span>
          <span className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="font-medium underline hover:text-amber-700"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-amber-700 underline hover:text-amber-900"
            >
              Discard
            </button>
          </span>
        </div>
      )}
      {overlayContainer && (
        <MDXEditor
          key={restoreVersion}
          markdown={markdown}
          onChange={handleChange}
          placeholder={placeholder}
          className="shr-mdxeditor light-theme text-gray-900"
          contentEditableClassName="shr-mdxeditor-content prose dark:prose-invert prose-sm sm:prose-base max-w-none min-h-[14rem] px-3 py-2"
          plugins={plugins}
          overlayContainer={overlayContainer}
          onError={(error) => {
            console.error('MDX Editor Error:', JSON.stringify(error));
          }}
        />
      )}
    </div>
  );
}
