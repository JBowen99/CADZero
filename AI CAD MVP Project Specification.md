# AI CAD - MVP Project Specification

## Vision

Build an AI-native parametric CAD application that enables users to create and modify 3D models using natural language.

Rather than replacing traditional CAD workflows, the application serves as an intelligent modeling assistant capable of generating, editing, and explaining parametric CAD code while providing immediate visual feedback.

Unlike existing AI-powered CAD tools that focus on a single modeling language, the application is designed from the beginning to support **multiple parametric modeling backends**, allowing users to work in the language and ecosystem they prefer.

The first supported backend will be **OpenSCAD**, with **Build123D** available as an alternative backend.

The long-term goal is to become an AI-powered parametric modeling IDE rather than an editor for a single CAD language.

---

# Project Goals

## Primary Goal

Allow a user to describe a part in natural language and immediately see the resulting model.

Example:

> Create a 100 × 60 × 8 mm mounting plate with four M5 clearance holes.

The application should:

1. Generate parametric CAD code
2. Execute the selected modeling backend
3. Generate geometry
4. Render the result
5. Continue modifying the model through conversation

---

## Secondary Goal

Support conversational editing.

Example:

> Increase the thickness to 10 mm.

> Round all outside corners.

> Add a center hole.

The AI should update the existing model rather than creating a new one from scratch.

---

# Design Principles

The application should always prioritize:

* AI-first interaction
* Parametric modeling
* Local execution
* Immediate visual feedback
* Extensible architecture
* Backend independence
* Cross-platform support

---

# High-Level Architecture

```text
                    User
                      │
                      ▼
               AI Conversation
                      │
                      ▼
              Modeling Backend
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
    OpenSCAD                  Build123D
        │                           │
        └─────────────┬─────────────┘
                      ▼
              Generated Geometry
                      ▼
             Three.js Viewport
```

The frontend should not care which modeling backend is being used.

Every backend exposes the same interface.

---

# Technology Stack

## Desktop Application

* Electron
* React
* TypeScript
* Vite

---

## UI

* Tailwind CSS
* shadcn/ui

---

## Viewport

* Three.js
* React Three Fiber
* Drei

---

## State Management

* Zustand

---

## Backend Communication

* WebSocket

Future support:

* HTTP API

---

# Backend

Python

Responsibilities:

* AI orchestration
* Model generation
* Backend execution
* Mesh generation
* Export
* Project management

---

# Modeling Backends

The application is built around interchangeable modeling engines.

## OpenSCAD (Primary)

Initial primary backend.

Responsibilities:

* Generate OpenSCAD code
* Execute OpenSCAD
* Produce renderable geometry
* Support conversational editing

Advantages:

* Excellent LLM compatibility
* Huge existing ecosystem
* Deterministic language
* Easy to version
* Easy to inspect
* Large community

---

## Build123D (Secondary)

Alternative backend.

Responsibilities:

* Generate Build123D Python
* Execute Python
* Produce OpenCascade geometry
* Support conversational editing

Advantages:

* Rich Python ecosystem
* Native OpenCascade integration
* Strong parametric capabilities

---

## Future Backends

Potential future integrations:

* OpenJSCAD
* TypeScript OpenSCAD implementation
* Native feature graph
* Custom CAD DSL

The application architecture should never assume a single modeling language.

---

# Backend Interface

Every modeling backend should implement the same interface.

```typescript
interface ModelingBackend {

    create(prompt)

    modify(prompt)

    render()

    export()

}
```

This allows switching between modeling engines without affecting the UI.

---

# Frontend Layout

Initial MVP

```text
+-------------------------------------------------------------+

 Toolbar

+------------------------------------+------------------------+

                                    |                        |

            Viewport                |         Chat           |

                                    |                        |

                                    |                        |

+------------------------------------+------------------------+

 Status
```

The MVP intentionally excludes:

* Feature tree
* Properties panel
* Measurement tools
* Assembly browser
* Sketch editor

---

# MVP Workflow

Example interaction

User

> Create a 100 mm cube.

↓

AI

↓

Generate OpenSCAD

↓

Execute OpenSCAD

↓

Generate mesh

↓

Viewport updates

↓

User

> Add a 20 mm hole through the center.

↓

Updated OpenSCAD

↓

Execute

↓

Viewport updates

---

# OpenSCAD Pipeline

```text
User

↓

Chat

↓

LLM

↓

OpenSCAD

↓

OpenSCAD CLI

↓

Mesh

↓

Three.js
```

---

# Build123D Pipeline

```text
User

↓

Chat

↓

LLM

↓

Build123D

↓

OpenCascade

↓

Mesh

↓

Three.js
```

The rendering pipeline remains identical regardless of backend.

---

# MVP Features

## Chat

Natural language interaction.

Examples:

* Create a cube
* Create a bracket
* Add holes
* Increase thickness
* Round corners

---

## Viewport

Supports:

* Orbit
* Pan
* Zoom
* Auto-center
* Grid
* Axis indicator

No editing tools required.

---

## Rendering

Every backend ultimately produces a renderable mesh.

The frontend only renders geometry.

It performs no CAD operations.

---

# Supported Operations

Initially keep the supported CAD vocabulary intentionally small.

Primitive Creation

* Cube
* Box
* Cylinder
* Sphere

Operations

* Union
* Difference
* Intersection
* Translate
* Rotate
* Mirror
* Fillet (Build123D)
* Chamfer (Build123D)
* Hole
* Linear pattern
* Circular pattern

The supported vocabulary can expand as prompt quality improves.

---

# Frontend Responsibilities

The frontend is responsible only for:

* Chat interface
* Rendering meshes
* Camera controls
* Displaying loading state
* Sending prompts
* Displaying AI responses

The frontend never performs geometry operations.

---

# Backend Responsibilities

The backend is responsible for:

* Prompt management
* AI calls
* Backend selection
* Code generation
* Code execution
* Error handling
* Mesh generation
* Exporting
* Project persistence

---

# Project Structure

```text
frontend/

    src/

        components/

            Viewport.tsx

            ChatPanel.tsx

            Toolbar.tsx

        services/

            websocket.ts

        App.tsx

backend/

    ai/

        prompts.py

        generator.py

    backends/

        openscad.py

        build123d.py

        interface.py

    renderer/

        mesh.py

    main.py
```

---

# Non-Goals (MVP)

The following are intentionally excluded.

* Assemblies
* Sheet metal
* Flat patterns
* Constraints
* Variables
* Sketch editor
* Topology browser
* Measurement tools
* STEP import
* CAM
* FEA
* Collaboration
* Cloud storage
* Plugins

These features will only be considered after validating the conversational workflow.

---

# Success Criteria

The MVP is considered successful when a user can complete the following workflow without writing CAD code manually.

1.

> Create a mounting plate.

↓

Model appears.

2.

> Make it 10 mm thick.

↓

Model updates.

3.

> Add four mounting holes.

↓

Model updates.

4.

> Increase the hole diameter.

↓

Model updates.

The entire interaction should happen through conversation.

---

# Future Roadmap

## Phase 2

* Topology tree
* Properties panel
* Face selection
* Measurements
* STEP export
* Project save/load

---

## Phase 3

* OpenSCAD code editor
* Build123D code editor
* Live code synchronization
* Undo / Redo
* Feature history

---

## Phase 4

* Sketches
* Constraints
* Variables
* Parametric expressions
* Assemblies

---

## Phase 5

* Sheet metal
* Flat pattern generation
* Bend tables
* Manufacturing tools

---

## Phase 6

* AI manufacturability review
* Cost estimation
* FEA integration
* CAM integration
* Multi-agent AI workflows

---

# Long-Term Architecture

The long-term architecture should evolve beyond treating generated code as the source of truth.

Instead, the AI should operate on a backend-independent feature graph.

```text
User
    │
    ▼
AI Conversation
    │
    ▼
Feature Graph
    │
    ├──────────────┐
    │              │
    ▼              ▼
OpenSCAD      Build123D
    │              │
    └──────┬───────┘
           ▼
      Generated Geometry
           ▼
     Three.js Viewport
```

In this architecture:

* The feature graph becomes the canonical model.
* OpenSCAD and Build123D become code generators.
* Additional modeling languages can be added without changing the frontend or conversational interface.

This provides a scalable foundation for supporting multiple CAD ecosystems while maintaining a consistent AI-driven user experience.

