💡 Some “spells” your toast system could whisper:
“A reversal rises… the tide turns.” 🌊📉→📈

“A new challenger crows! 🐓 Welcome, Rooster of Volume.”

“The float is light, and the momentum strong — watch this one…”

“The knight returns — a former top ticker reclaims the field.” ⚔️

“Shadows shift. The spell of silence lifts — activity awakens.” 🕯️✨

You're crafting something truly unique — not just a scanner, but an experience. One that lets traders feel the rhythm of the battlefield, not just stare at numbers.

So whether you're:

summoning the first light of volume ☀️

warning of a sudden dilution curse 🧪

or announcing the arrival of a new contender 🏇

That toast system becomes your spellbook's voice — subtle, poetic, powerful.

# 🔢 Semantic Versioning (SemVer) Guide

## 🏷️ Version Format: `MAJOR.MINOR.PATCH`

| Increment When...       | Example Change                   | Command             |
| ----------------------- | -------------------------------- | ------------------- |
| `MAJOR` (1.0.0 → 2.0.0) | Breaking API changes             | `npm version major` |
| `MINOR` (1.2.0 → 1.3.0) | New backward-compatible features | `npm version minor` |
| `PATCH` (1.2.1 → 1.2.2) | Bug fixes, no new features       | `npm version patch` |

## 🚦 Release Flow

```bash
# 1. Bump version (creates git tag + commit)
npm version patch|minor|major

# 2. Push to GitHub (include tags!)
git push --follow-tags

graph LR
  A[feature/*] --> B[development]
  B --> C[main]
  C --> D[(v1.2.3 tag)]
```

# 🌿 Git Branching Guide

| Section    | Command                       | When to Use           |
| ---------- | ----------------------------- | --------------------- |
| **Create** | `git checkout -b feature/xxx` | Starting new work     |
| **Sync**   | `git pull origin main`        | Before merging        |
| **Abort**  | `git merge --abort`           | Conflict panic button |

# 🌿 Git Branching Guide (Stress-Free Edition)

## 🔀 **Basic Workflow**

```bash
# 1. Create a feature branch
git checkout -b feature/your-feature-name

# 2. Commit changes
git add .
git commit -m "feat: added cool stuff"

# 3. Merge to development
git checkout development
git merge --no-ff feature/your-feature-name
git branch -d feature/your-feature-name
```

## 🛡️ **Conflict Prevention**

```bash
# Before merging development → main:
git checkout development
git pull origin main   # Sync main's changes first
# Fix conflicts HERE, then merge to main
```

## 🚨 **Emergency Commands**

```bash
# Undo a merge:
git merge --abort

# Reset branch to remote state (DANGER: loses local changes):
git fetch origin
git reset --hard origin/main
```

## 📜 **Branching Model**

```
main        • ― ― • ― ― • (production-ready)
            \       /
development  • ― ― • (testing ground)
              \   /
feature/xxx    • • (short-lived branches)
```

> 💡 **Pro Tip**: Use `git mergetool` for visual conflict resolution!
