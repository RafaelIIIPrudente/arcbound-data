# React 19 — docs digest

**Pinned to:** React 19 — `react ^19.1.0`, `react-dom ^19.1.0`, `@types/react ^19.1.0`,
`@types/react-dom ^19.1.1` (see the repo `package.json`). Refresh if the major bumps.

**Researched on:** 2026-07-16. A distillation of the CURRENT React 19 API — a summary with
citations, not a copy of the docs. RSC/Server-Action wiring is provided by Next 15 (see the
`nextjs-15-app-router` skill).

**Official sources:**

- <https://react.dev/blog/2024/12/05/react-19>
- <https://react.dev/reference/react/useActionState>
- <https://react.dev/reference/react-dom/hooks/useFormStatus>
- <https://react.dev/reference/react/useOptimistic>
- <https://react.dev/reference/react/use>
- <https://react.dev/reference/react/hooks>
- <https://react.dev/reference/react-dom/components/form>
- <https://react.dev/reference/react/forwardRef>
- <https://react.dev/reference/react-dom/components/title>

---

## Actions & forms

- **Actions** = async functions run inside a transition. React manages the pending state,
  optimistic updates, error handling (reverts optimistic UI, surfaces to the nearest Error
  Boundary), and form submission automatically (<https://react.dev/blog/2024/12/05/react-19>).
- **`<form action={fn}>`** — `action` accepts a URL, a client function, or a Server Function
  (`"use server"`). The function receives the form's `FormData`, runs in a transition (tracks
  pending), submits via POST with no `e.preventDefault()`, and **auto-resets uncontrolled
  fields after a successful submit** (<https://react.dev/reference/react-dom/components/form>).
  `formAction` on a button overrides the form's action for that submit.
- **`useActionState(action, initialState, permalink?)`** → `[state, formAction, isPending]`.
  `action` is `(previousState, formData) => newState`; `state` starts as `initialState` then
  becomes the return; pass `formAction` to `<form action>`; `isPending` is true while in
  flight (<https://react.dev/reference/react/useActionState>). (Renamed from the Canary
  `useFormState`, which is deprecated.)
- **`useFormStatus()`** (from `react-dom`) → `{ pending, data, method, action }` for the
  **parent** `<form>`. Must be called from a component rendered **inside** that form — lets a
  design-system submit button read pending state without prop drilling
  (<https://react.dev/reference/react-dom/hooks/useFormStatus>).

## `useOptimistic`

- **`const [optimisticState, addOptimistic] = useOptimistic(state, updateFn?)`**. Call the
  setter **inside an Action**; React shows the optimistic value immediately, holds it during
  the async work, then converges back to the real `state` in one commit (auto-reverting on
  error) (<https://react.dev/reference/react/useOptimistic>).

## `use()` API

- **`const value = use(resource)`** where `resource` is a **Promise** or a **Context**
  (<https://react.dev/reference/react/use>).
- Promise: the component suspends (needs a `<Suspense>` boundary), returns the resolved value,
  and routes rejection to an Error Boundary. The promise must be **cached/stable**, and
  `use()` **cannot be wrapped in try/catch**.
- Unlike hooks, `use()` **may be called conditionally** — inside `if`, early returns, loops —
  but still only from a component/custom hook. Reading Context with `use` is not supported in
  Server Components.

## ref-as-a-prop

- Function components accept **`ref` as an ordinary prop** in React 19 — `forwardRef` is no
  longer needed and is slated for deprecation
  (<https://react.dev/blog/2024/12/05/react-19>, <https://react.dev/reference/react/forwardRef>):
  ```tsx
  function MyInput({ placeholder, ref }) {
    return <input placeholder={placeholder} ref={ref} />;
  }
  // <MyInput ref={ref} />
  ```
- Callback refs may now **return a cleanup function** that runs on unmount.

## Document Metadata

- `<title>`, `<meta>`, and `<link>` rendered **anywhere** in the tree are natively hoisted
  into `<head>` (<https://react.dev/blog/2024/12/05/react-19>,
  <https://react.dev/reference/react-dom/components/title>). Related: stylesheets with
  `precedence` and deduplicated async scripts. _(In this repo, page-level metadata is handled
  by Next's Metadata API — see the `nextjs-15-app-router` skill — not hand-rendered tags.)_

## Other React 19 changes

- **`propTypes` and `defaultProps` removed for function components** — use default params / TS
  types (<https://react.dev/blog/2024/12/05/react-19>).
- **Legacy Context** (`contextTypes`/`childContextTypes`) and **string refs** removed — use
  `createContext` and callback refs / `useRef`.
- **`<Context>` as provider**: render `<ThemeContext value="dark">…</ThemeContext>` directly;
  `<Context.Provider>` is being deprecated.
- **`useDeferredValue`** gained an initial-value second arg.
- **Resource preloading** from `react-dom`: `preinit`, `preload`, `prefetchDNS`, `preconnect`.
- New root error options `onCaughtError` / `onUncaughtError` / `onRecoverableError`; improved
  hydration-error diffs; Custom Elements support.

## Hooks reference (quick)

Canonical built-in hooks (<https://react.dev/reference/react/hooks>): State — `useState`,
`useReducer`; Context — `useContext`; Ref — `useRef`, `useImperativeHandle`; Effect —
`useEffect`, `useLayoutEffect`, `useInsertionEffect`; Performance — `useMemo`, `useCallback`,
`useTransition`, `useDeferredValue`; Other — `useDebugValue`, `useId`, `useSyncExternalStore`,
`useActionState`. **New in 19**: `useActionState` and `useOptimistic` (from `react`),
`useFormStatus` (from `react-dom`); the non-hook `use()` API is documented separately.
