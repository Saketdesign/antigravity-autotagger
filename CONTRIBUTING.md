# contributing to antigravity autotagger

thanks for taking the time to contribute.

## development setup

1. fork and clone the repository:
   ```bash
   git clone https://github.com/Saketdesign/antigravity-autotagger.git
   cd antigravity-autotagger
   ```
2. install dependencies:
   ```bash
   npm install
   ```
3. build or run in watch mode:
   ```bash
   npm run build
   # or watch mode
   npm run dev
   ```
4. import the local project folder into eagle via `plugins` → `developer options` → `import local project...`.

## pull request process

1. create a branch from `master`.
2. make your changes and keep them scoped.
3. verify lint and build pass without warnings:
   ```bash
   npm run lint
   npm run build
   ```
4. write commit messages and pull request descriptions in plain lowercase english. describe what changed and why.
5. submit your pull request.

## support commitment

bug reports, questions, and pull requests are triaged within 24 hours. if you have a question or an idea, open an issue or start a discussion.
