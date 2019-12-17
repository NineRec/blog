---
title: "Uber Go Style"
categories: [golang]
date: 2019-10-14T09:57:06+08:00
url: /post/uber-go-stype/
---

围观了《Uber Go 语言编码规范》，记录一些觉得有意思的部分。

Github 链接: https://github.com/uber-go/guide

<!--more-->

## Styles are the conventions

1. 编码规范更多是写代码的惯例，更准确的说，这是 Uber 公司内推荐使用的编码惯例。
2. 规范是为了提升组内整体的 Coding & Review  效率，“约定大于 ~~配置~~ 个人喜好”。
3. 不一定说规范反对的就是错误的，更多是通过规范，提升一群人一起写代码的效率，避免一些常被忽略的错误。

## Zero-value ~~Mutexes~~ are Valid

有一些场景，零值或者说，默认值是有意义而且可以直接使用的，通常，这些场景可以直接 `var foo TYPE`。

```
var mu sync.Mutex
mu.Lock()

// 补充一个 slice 的
var slc []int
slc = append(slc, 12)
```

## Start Enums at One

1. 同样也是默认值的问题，考虑的点依然是默认值是否有实际的含义
    - 除非 0 有实际意义，我们应该从 1 开始，避免无意义的默认值导致一些问题；
    - Go 的默认值是个有意思的坑，每个类型都有自己的默认值，而且很多地方，你如果不明确赋值，你就会拿到一个默认值。
2. (补充) 我们是否应该使用 iota?
    - 其实如果 enums 值过多，而且偶尔变更，或者需要删除，不用 iota 更合适。否则我们删除某个中间的枚举，只能在代码里留下 `_`。

类似的建议，如果是 string 类型的 Enums，要考虑空字符串 `""` 是否有实际意义。

## Error Wrapping

1. 如果没有上下文，“Var ExporetedErr = error.New(“...”)”
2. 如果有要增加的上下文： “pkg/errors”.Wrap
    - 如果使用了 “pkg/errors”.Wrap，可以只在代码的最上层做 logging。

## Package Names

1. Not "common", "util", "shared", or "lib". These are bad, uninformative names.
    - What should we use?
2. Short and succinct. Remember that the name is identified in full at every call site.
    - Prefer ext/Dal than ext/fooddataservice, FDT than fooddeliverytaskpool
    - Does not need to be renamed using named imports at most call sites

## Structure your code

1. 分组并且排序所有的 functions/methods：
    - Const > Type > Var > Init > Exported > unexported
2. 减少缩紧层级：
    - 去掉不必要的 Else，“prefer early return than else”。
3. 按逻辑结构组织代码 (https://about.sourcegraph.com/handbook/engineering/go_style_guide)

```
a, b, c := Vector{1, 2, 3}, Vector{4, 5, 6}, Vector{7, 8, 9}
a, b := swap(a, b)

total := add([]Vector(a, b, c))...)

// better structure
a, b := Vector{1, 2, 3}, Vector{4, 5, 6}
a, b := swap(a, b)

c := Vector{7, 8, 9}
total := add([]Vector(a, b, c))...)
```

