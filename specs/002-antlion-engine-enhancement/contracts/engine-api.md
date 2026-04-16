# Engine API Contract: Game Object System

**Date**: 2026-04-16

This documents the public API surface added to the Antlion engine. These are internal interfaces (consumed by feature modules within the same codebase), not external APIs.

## GameObject

```
constructor(name: string)

// Lifecycle (override in subclasses)
onCreate()                    → void
onDestroy()                   → void
update(dt: number)            → void    // dt in milliseconds
render()                      → void

// State
enable()                      → void
disable()                     → void
setEnabled(bool: boolean)     → void
show()                        → void
hide()                        → void
setVisible(bool: boolean)     → void
isEnabled()                   → boolean
isVisible()                   → boolean

// Behaviours
addBehaviour(name: string, b: Behaviour)  → void
removeBehaviour(name: string)              → void
getBehaviour(name: string)                 → Behaviour | undefined

// Tree
getScene()                    → Scene | null
getEngine()                   → Antlion | null
```

## HtmlGameObject (extends GameObject)

```
constructor(name: string, tag?: string = 'div')
static adopt(name: string, element: HTMLElement) → HtmlGameObject

get element()                 → HTMLElement
markDirty()                   → void
renderContent()               → void   // override point

bindInput(domEvent: string, engineEvent: string) → void
```

## HtmlContainer (extends HtmlGameObject)

```
constructor(name: string, tag?: string = 'div')

addChild(child: GameObject)   → void
removeChild(child: GameObject) → void
removeAllChildren()           → void
getChild(name: string)        → GameObject | undefined
hasChild(name: string)        → boolean

get children()                → Array<GameObject>   // shallow copy
```

## Scene

```
constructor(engine: Antlion, rootElement: HTMLElement)

engine                        → Antlion (public property)
root                          → HtmlContainer (public property)

start()                       → void
stop()                        → void
```

## Behaviour

```
constructor()

owner                         → GameObject | null
enable()                      → void
disable()                     → void

// Lifecycle (override in subclasses)
onAttach()                    → void
onDetach()                    → void
update(dt: number)            → void
```
