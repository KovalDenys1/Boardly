'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

export interface TabIndicatorStyle {
  left: number
  width: number
  opacity: number
}

const HIDDEN: TabIndicatorStyle = { left: 0, width: 0, opacity: 0 }

/** The list is held in state, not a ref: /profile mounts it after a loading screen, and measuring must wait for it. */
export function useTabIndicator<T extends string>(
  activeTab: T,
  { insetPx = 0, listRef }: { insetPx?: number; listRef?: MutableRefObject<HTMLElement | null> } = {},
) {
  const [listElement, setListElement] = useState<HTMLElement | null>(null)
  const buttonsRef = useRef<Partial<Record<T, HTMLElement | null>>>({})
  const [style, setStyle] = useState<TabIndicatorStyle>(HIDDEN)

  const setList = useCallback(
    (node: HTMLElement | null) => {
      if (listRef) listRef.current = node
      setListElement(node)
    },
    [listRef],
  )

  const setButton = useCallback(
    (id: T) => (node: HTMLElement | null) => {
      buttonsRef.current[id] = node
    },
    [],
  )

  const measure = useCallback(() => {
    const button = buttonsRef.current[activeTab]
    if (!listElement || !button) {
      setStyle((current) => (current.opacity === 0 ? current : HIDDEN))
      return
    }
    const listRect = listElement.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const next = {
      left: buttonRect.left - listRect.left + insetPx,
      width: Math.max(buttonRect.width - insetPx * 2, 0),
      opacity: 1,
    }
    setStyle((current) =>
      current.left === next.left && current.width === next.width && current.opacity === next.opacity ? current : next,
    )
  }, [activeTab, insetPx, listElement])

  useEffect(() => {
    measure()
    // Labels change width when the display font arrives, after this first pass.
    const frameId = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)

    let observer: ResizeObserver | null = null
    const button = buttonsRef.current[activeTab]
    if (typeof ResizeObserver === 'function' && listElement) {
      observer = new ResizeObserver(measure)
      observer.observe(listElement)
      if (button) observer.observe(button)
    }

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [activeTab, listElement, measure])

  // The first placement lands without a transition, so a deep link to a later tab does not slide in from the left.
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    // Hidden again (the tab list unmounted, e.g. a session update): the next placement must not slide in either.
    if (style.opacity === 0) {
      setAnimate(false)
      return
    }
    if (animate) return
    let second = 0
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setAnimate(true))
    })
    return () => {
      window.cancelAnimationFrame(first)
      window.cancelAnimationFrame(second)
    }
  }, [animate, style.opacity])

  return { indicatorStyle: style, animate, setList, setButton }
}
