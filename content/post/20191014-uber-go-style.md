---
title: "Uber Go Style"
categories: [golang]
date: 2019-10-14T09:57:06+08:00
url: /post/uber-go-stype/
draft: true
---

围观了《Uber Go 语言编码规范》，记录一些觉得有意思的部分。

Github 链接: https://github.com/uber-go/guide

<!--more-->

> Styles are the conventions that govern our code.

编码规范更多是写代码的惯例，更准确的说，是 Uber 公司内推荐使用的编码惯例。不一定说规范反对的就是错误的，更多是通过规范，提升一群人一起写代码的效率，避免一些常被忽略的错误。

> Zero-value ~Mutexes~ are Valid

有一些场景，零值或者说，默认值是有意义而且可以直接使用的，通常，这些场景可以直接 `var foo TYPE`。

```
var mu sync.Mutex
mu.Lock()

// 补充一个 slice 的
var slc []int
slc = append(slc, 12)
```
> Start Enums at One

同样也是默认值的问题，考虑的点依然是默认值是否有实际的含义。
Go 的默认值是个有意思的坑，每个类型都有自己的默认值，而且很多地方，你如果不明确赋值，你就会拿到一个默认值。

类似的建议，如果是string类型的，要考虑空字符串 `""` 是否有实际意义。

> Slices and Maps


