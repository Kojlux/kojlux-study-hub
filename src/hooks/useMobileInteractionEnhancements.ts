import { useEffect } from 'react';

const ACTIONABLE_SELECTOR =
  'button, a, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"]), .cursor-pointer, input[type="button"], input[type="submit"]';
const DUPLICATE_TAP_WINDOW_MS = 350;

export function useMobileInteractionEnhancements(): void {
  useEffect(() => {
    const lastActivation = new WeakMap<Element, number>();
    const scrollAreas = new Map<HTMLElement, { refresh: () => void; cleanup: () => void }>();
    let scrollFrame = 0;

    const scrollFocusedInputIntoView = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement) || !target.matches('input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        if (!target.isConnected) return;
        target.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });
    };

    const onFocusIn = (event: FocusEvent) => scrollFocusedInputIntoView(event.target);
    const onViewportResize = () => scrollFocusedInputIntoView(document.activeElement);
    const refreshScrollAreas = () => scrollAreas.forEach(({ refresh }) => refresh());
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest(ACTIONABLE_SELECTOR);
      if (!control) return;

      const now = performance.now();
      const previousActivation = lastActivation.get(control);
      if (previousActivation !== undefined && now - previousActivation < DUPLICATE_TAP_WINDOW_MS) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      lastActivation.set(control, now);
    };

    const visualViewport = window.visualViewport;
    const updateViewportHeight = () => {
      if (visualViewport) {
        document.documentElement.style.setProperty('--app-dialog-max-height', `${visualViewport.height * 0.85}px`);
      }
      refreshScrollAreas();
    };

    const isVerticalScrollArea = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      return style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll';
    };

    const observeScrollArea = (element: HTMLElement) => {
      if (scrollAreas.has(element) || !isVerticalScrollArea(element)) return;
      const initialChildren = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      const firstTwo = initialChildren.slice(0, 2);
      const style = window.getComputedStyle(element);
      const isHorizontalRow =
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        element.scrollWidth > element.clientWidth + 1 &&
        firstTwo.length === 2 &&
        Math.abs(firstTwo[0].getBoundingClientRect().top - firstTwo[1].getBoundingClientRect().top) < 1;
      if (isHorizontalRow) return;
      const originalMaxHeight = element.style.maxHeight;
      const computedMaxHeight = Number.parseFloat(window.getComputedStyle(element).maxHeight);
      element.classList.add('app-scroll-peek');

      const refresh = () => {
        const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
        const firstThree = children.slice(0, 3);
        if (
          firstThree.length === 3 &&
          firstThree.every((child) => child.tagName === firstThree[0].tagName && child.className === firstThree[0].className) &&
          firstThree[1].getBoundingClientRect().top > firstThree[0].getBoundingClientRect().top + firstThree[0].getBoundingClientRect().height * 0.5 &&
          firstThree[2].getBoundingClientRect().top > firstThree[1].getBoundingClientRect().top + firstThree[1].getBoundingClientRect().height * 0.5
        ) {
          const containerTop = element.getBoundingClientRect().top;
          const third = firstThree[2].getBoundingClientRect();
          const targetHeight = third.top - containerTop + element.scrollTop + third.height * 0.32;
          const viewportBottom = visualViewport
            ? visualViewport.offsetTop + visualViewport.height
            : window.innerHeight;
          const availableHeight = viewportBottom - containerTop - 12;
          if (targetHeight > 0 && availableHeight > 0) {
            const existingLimit = Number.isFinite(computedMaxHeight) ? computedMaxHeight : Infinity;
            element.style.maxHeight = `${Math.min(targetHeight, availableHeight, existingLimit)}px`;
          }
        } else {
          element.style.maxHeight = originalMaxHeight;
        }

        const hasMore = element.scrollHeight > element.clientHeight + 1 &&
          element.scrollTop + element.clientHeight < element.scrollHeight - 1;
        element.dataset.appScrollHasMore = String(hasMore);
      };

      const resizeObserver = new ResizeObserver(refresh);
      resizeObserver.observe(element);
      Array.from(element.children).forEach((child) => {
        if (child instanceof HTMLElement) resizeObserver.observe(child);
      });
      const contentObserver = new MutationObserver(refresh);
      contentObserver.observe(element, { childList: true, subtree: true, characterData: true });
      element.addEventListener('scroll', refresh, { passive: true });
      scrollAreas.set(element, {
        refresh,
        cleanup: () => {
          element.removeEventListener('scroll', refresh);
          resizeObserver.disconnect();
          contentObserver.disconnect();
          element.style.maxHeight = originalMaxHeight;
          element.classList.remove('app-scroll-peek');
          delete element.dataset.appScrollHasMore;
        },
      });
      refresh();
    };

    const scanScrollAreas = (root: Node) => {
      if (root instanceof HTMLElement) observeScrollArea(root);
      if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
        root.querySelectorAll<HTMLElement>('*').forEach(observeScrollArea);
      }
    };

    scanScrollAreas(document.body);
    const documentObserver = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(scanScrollAreas));
      scrollAreas.forEach(({ cleanup }, element) => {
        if (!element.isConnected) {
          cleanup();
          scrollAreas.delete(element);
        }
      });
    });
    documentObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', refreshScrollAreas);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('click', onClick, true);
    visualViewport?.addEventListener('resize', onViewportResize);
    visualViewport?.addEventListener('resize', updateViewportHeight);
    updateViewportHeight();

    return () => {
      cancelAnimationFrame(scrollFrame);
      documentObserver.disconnect();
      scrollAreas.forEach(({ cleanup }) => cleanup());
      scrollAreas.clear();
      window.removeEventListener('resize', refreshScrollAreas);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('click', onClick, true);
      visualViewport?.removeEventListener('resize', onViewportResize);
      visualViewport?.removeEventListener('resize', updateViewportHeight);
      document.documentElement.style.removeProperty('--app-dialog-max-height');
    };
  }, []);
}
