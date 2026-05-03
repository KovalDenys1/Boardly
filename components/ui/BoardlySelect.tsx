'use client'

import { Fragment, type ReactNode } from 'react'
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from '@headlessui/react'

export interface BoardlySelectOption {
  value: string
  label: string
  description?: string
  badge?: string
}

interface BoardlySelectProps {
  value: string
  options: BoardlySelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  renderValue?: (option: BoardlySelectOption | undefined) => ReactNode
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

export default function BoardlySelect({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  renderValue,
}: BoardlySelectProps) {
  const selectedOption = options.find((option) => option.value === value)

  return (
    <Listbox value={value} onChange={onChange}>
      <div className={`relative w-full ${className}`}>
        <ListboxButton
          aria-label={ariaLabel}
          className="inline-flex w-full items-center gap-3 rounded-2xl border border-bd-line bg-white px-4 py-3 text-left text-sm font-medium text-bd-ink shadow-sm transition-all hover:-translate-y-0.5 hover:bg-bd-card-warm focus:outline-none focus-visible:ring-2 focus-visible:ring-bd-lav/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-800"
        >
          <span className="min-w-0 flex-1">
            {renderValue ? (
              renderValue(selectedOption)
            ) : (
              <span className="block truncate">{selectedOption?.label ?? ''}</span>
            )}
          </span>

          <span className="shrink-0 text-bd-ink-muted dark:text-slate-400">
            <ChevronDownIcon />
          </span>
        </ListboxButton>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-150"
          enterFrom="opacity-0 translate-y-1 scale-[0.98]"
          enterTo="opacity-100 translate-y-0 scale-100"
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100 translate-y-0 scale-100"
          leaveTo="opacity-0 translate-y-1 scale-[0.98]"
        >
          <ListboxOptions className="absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-auto rounded-[1.25rem] border-[1.5px] border-bd-line bg-white p-1.5 shadow-[0_18px_36px_-18px_rgba(31,27,22,0.35)] focus:outline-none dark:border-slate-700 dark:bg-slate-900">
            {options.map((option) => (
              <ListboxOption
                key={option.value}
                value={option.value}
                className={({ focus, selected }) =>
                  `cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
                    selected
                      ? 'bg-bd-lav/15 text-bd-lav-deep dark:bg-bd-lav/15 dark:text-bd-lav'
                      : focus
                        ? 'bg-bd-card-warm text-bd-ink dark:bg-slate-800 dark:text-slate-100'
                        : 'text-bd-ink-soft dark:text-slate-300'
                  }`
                }
              >
                {({ selected }) => (
                  <div className="flex items-center gap-3">
                    {option.badge ? (
                      <span
                        className={`inline-flex h-7 min-w-[2.4rem] shrink-0 items-center justify-center rounded-full px-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${
                          selected
                            ? 'bg-bd-lav text-white'
                            : 'bg-bd-bg2 text-bd-ink-muted dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {option.badge}
                      </span>
                    ) : null}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{option.label}</span>
                      {option.description ? (
                        <span className="mt-0.5 block text-xs text-bd-ink-muted dark:text-slate-400">
                          {option.description}
                        </span>
                      ) : null}
                    </span>

                    <span className="shrink-0">{selected ? <CheckIcon /> : null}</span>
                  </div>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Transition>
      </div>
    </Listbox>
  )
}
