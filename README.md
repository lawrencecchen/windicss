<h1 align="center">
<a href="https://github.com/windicss/windicss/wiki">
  <img src="https://windicss.netlify.app/assets/logo.svg" alt="Windi CSS Logo" height="120" width="120"/><br>
</a>
  Windi CSS
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/windicss"><img src="https://img.shields.io/npm/v/windicss.svg" alt="Npm Version"></a>
  <a href="https://www.npmjs.com/package/windicss"><img src="https://img.shields.io/npm/dt/windicss.svg" alt="Total Downloads"></a>
  <a href="https://github.com/windicss/windicss/actions"><img src="https://img.shields.io/github/workflow/status/windicss/windicss/Node.js%20CI" alt="Build Status"></a>
  <a href="https://codecov.io/gh/windicss/windicss"><img src="https://img.shields.io/codecov/c/github/windicss/windicss/dev.svg?sanitize=true" alt="Coverage"></a>
  <a href="https://discord.gg/aRYWm8r8Eq"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat&logo=discord" alt="Discord Chat"></a>
  <br>
</p>

<p align="center">Next-generation <a href="https://tailwindcss.com/docs">Tailwind CSS</a> compiler.</p>

<p>If you are already familiar with Tailwind CSS, think about Windi CSS as an alternative to it. Which provides faster load time, full compatibility with Tailwind v2.0 with even more features.</p>
<p>Otherwise, you can think of Windi CSS as a utility-first CSS library.</p>

[tailwind css]: https://tailwindcss.com/docs
[windi css]: https://windicss.netlify.app
[website]: https://windicss.netlify.app
[video comparison]: https://twitter.com/antfu7/status/1361398324587163648

## Why Windi CSS? 🤔

A quote from the author should illustrate his motivation to create [Windi CSS]:

> When my project became larger and there were about dozens of components, the initial compilation time reached 3s, and hot updates took more than 1s. @voorjar

By scanning your HTML and CSS and generating utilities on demand, [Windi CSS] is able to provide [faster load times][video comparison] and a speedy HMR in development, and does not require purging in production.

Read more about it in the [Introduction](https://windicss.netlify.app/guide/introduction).

## Integrations

| Frameworks | Package | Version |
| --- | --- | --- |
| CLI | [Built-in](https://windicss.netlify.app/guide/cli) | ![](https://img.shields.io/npm/v/windicss?label=) |
| Vite | [vite-plugin-windicss](https://github.com/windicss/vite-plugin-windicss) | ![](https://img.shields.io/npm/v/vite-plugin-windicss?label=) |
| Vue (Webpack) | [vue-windicss-preprocess](https://github.com/windicss/vue-windicss-preprocess) | ![](https://img.shields.io/npm/v/vue-windicss-preprocess?label=) |
| Svelte | [svelte-windicss-preprocess](https://github.com/windicss/svelte-windicss-preprocess) | ![](https://img.shields.io/npm/v/svelte-windicss-preprocess?label=) |
| React | Coming soon... | |
| Angular | Coming soon... | |

## Documentation 📖

Check [the documentation website][website].

## Discussions

We’re using [GitHub Discussions](https://github.com/windicss/windicss/discussions) as a place to connect with other members of our community. You are free to ask questions and share ideas, so enjoy yourself.

## Contributing

If you're interested in contributing to windicss, please read our [contributing docs](https://github.com/windicss/windicss/blob/main/CONTRIBUTING.md) **before submitting a pull request**.

## License

Distributed under the [MIT License](https://github.com/windicss/windicss/blob/main/LICENSE).
