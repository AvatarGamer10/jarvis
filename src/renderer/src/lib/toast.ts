/**
 * Floating notices.
 *
 * They float rather than sit in the flow because messages used to push the
 * page down — you saved a setting and the button you had just clicked moved
 * out from under the cursor.
 *
 * This is also where Undo lives. A permanent undo button would be shouting
 * all day about something that is almost never wanted; inside a notice that
 * clears itself, it turns up exactly when it is useful and then leaves.
 *
 * It is a hand-rolled emitter and not React context because the callers are
 * async functions outside the component tree, where there are no hooks.
 */

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
  action?: ToastAction
}

/**
 * How many are visible at once.
 *
 * Deleting eight tasks in a row used to stack notices half way up the window
 * and off the top. The oldest Undo is lost, but burying the app under its own
 * notifications is the worse trade.
 */
const MAX_VISIBLE = 3

/** Time on screen, in milliseconds. */
const LIFETIME = {
  /** Long enough to read once. */
  info: 4000,
  /** An error you want to be able to read twice. */
  error: 8000,
  /** With a button, you need time to react and get the pointer there. */
  withAction: 7000
}

type Listener = (toasts: Toast[]) => void

class ToastBus {
  private items: Toast[] = []
  private readonly listeners = new Set<Listener>()
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>()
  private nextId = 1

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.items)
    return () => {
      this.listeners.delete(listener)
    }
  }

  show(text: string, options: { kind?: Toast['kind']; action?: ToastAction } = {}): number {
    const kind = options.kind ?? 'info'
    const toast: Toast = { id: this.nextId++, text, kind, action: options.action }

    this.items = [...this.items, toast]
    // Overflow is genuinely dismissed rather than hidden, so its timer is
    // cleared too.
    while (this.items.length > MAX_VISIBLE) this.dismiss(this.items[0].id)
    this.emit()

    const lifetime = options.action
      ? LIFETIME.withAction
      : kind === 'error'
        ? LIFETIME.error
        : LIFETIME.info

    this.timers.set(
      toast.id,
      setTimeout(() => this.dismiss(toast.id), lifetime)
    )

    return toast.id
  }

  error(text: string): number {
    return this.show(text, { kind: 'error' })
  }

  /** Shorthand for the "done, but you can take it back" pattern. */
  undoable(text: string, undo: () => void | Promise<void>): number {
    return this.show(text, { action: { label: 'Undo', run: undo } })
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
    this.items = this.items.filter((toast) => toast.id !== id)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.items)
  }
}

export const toast = new ToastBus()
