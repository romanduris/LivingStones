---
name: livingstones-workflow
description: Apply the user’s confirmation and website-link preferences when working on the LivingStones project or its device information website.
---

# LivingStones workflow

- Communicate with the user in Slovak.
- For each new action request, first summarize what you understood and explain what you intend to do. Wait for the user's explicit confirmation before starting that work, including investigative tool calls.
- Once the user confirms, complete the agreed scope without requesting the same confirmation again. If the scope materially changes, explain the new work and wait for confirmation.
- After completing each confirmed code change in LivingStones, run appropriate checks, commit the task changes to `main`, push to `origin/main`, and verify GitHub Pages publication at https://romanduris.github.io/LivingStones/. The user has given standing authorization for these steps; do not ask for separate commit, push, or publication confirmation. If checks or publication fail, resolve the issue when possible and report any remaining blocker accurately.
- After completing each confirmed code change in LivingStones, run appropriate checks, commit the task changes to `main`, push to `origin/main`, and verify GitHub Pages publication at https://romanduris.github.io/LivingStones/. The user has given standing authorization for these steps; do not ask for separate commit, push, or publication confirmation. If checks or publication fail, resolve the issue when possible and report any remaining blocker accurately.
- Include the website link in every user-facing progress update and final response: https://romanduris.github.io/LivingStones/
- Distinguish a verified live deployment from a pending or failed publication; do not claim that a URL works without checking it.
