# CodePanic Blog Content

The repo for `blog.CodePanic.cn`. Based on Hugo.

Directly copied the theme [hugo-theme-even](https://github.com/olOwOlo/hugo-theme-even) code to folder `theme/even`, as repo not actively maintained, and there are bugs need to be fixed.

## init the repo

```bash
git clone https://github.com/NineRec/blog.git
git submodule update --init
```

## new post

```
hugo new post/blog-title.md
```

## deploy

```
sh deploy.sh
```

## Interactive storybook

[Zoey's Little Wonders](static/butterfly-adventure/README.md) lives in `static/butterfly-adventure/` and is published at `/butterfly-adventure/`. A separate selection page opens ten viewport-filling games: butterfly garden, zoo, ocean, clock cottage, market, kitchen, a safe walk, counting picnic, letter post, and a Mandarin planting story. Original SVG materials have an independent motion gallery, zoo/ocean support two-dimensional touch panning, and all English recordings use the selected Zoey curious voice. For a local preview, run `python3 -m http.server 8080 --directory static` and open `http://localhost:8080/butterfly-adventure/`.
