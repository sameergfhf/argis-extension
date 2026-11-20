import React, { useId, useState } from 'react';

export interface TabItem {
  value: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function Tabs({ tabs, value, defaultValue, onValueChange, ariaLabel = 'Content sections', className = '' }: TabsProps) {
  const generatedId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? tabs.find((tab) => !tab.disabled)?.value ?? '');
  const isControlled = value !== undefined;
  const activeValue = isControlled ? value : internalValue;
  const activeTab = tabs.find((tab) => tab.value === activeValue && !tab.disabled) ?? tabs.find((tab) => !tab.disabled);

  const selectTab = (nextValue: string) => {
    if (!isControlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const enabledTabs = tabs.filter((tab) => !tab.disabled);
    if (enabledTabs.length === 0) return;
    event.preventDefault();
    const currentIndex = enabledTabs.findIndex((tab) => tab.value === activeTab?.value);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? enabledTabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + enabledTabs.length) % enabledTabs.length;
    const nextTab = enabledTabs[nextIndex];
    selectTab(nextTab.value);
    document.getElementById(`${generatedId}-tab-${nextTab.value}`)?.focus();
  };

  if (!activeTab) return null;

  return (
    <div className={className}>
      <div role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown} className="flex flex-wrap items-center gap-1 border-b border-line">
        {tabs.map((tab) => {
          const selected = tab.value === activeTab.value;
          return (
            <button
              key={tab.value}
              id={`${generatedId}-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${generatedId}-panel-${tab.value}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => selectTab(tab.value)}
              className={`relative inline-flex min-h-11 items-center justify-center border-b-2 px-4 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-ink text-ink' : 'border-transparent text-muted hover:border-line-strong hover:text-ink'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={`${generatedId}-panel-${activeTab.value}`}
        role="tabpanel"
        aria-labelledby={`${generatedId}-tab-${activeTab.value}`}
        tabIndex={0}
        className="pt-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
      >
        {activeTab.content}
      </div>
    </div>
  );
}
