---
title: "Why Go Atomic Not Using Generics"
categories: [golang]
date: 2024-04-08T10:56:28+08:00
lastmod: 2024-04-08T10:56:28+08:00
url: /post/go-atomic-not-using-generics
---

一个很简单的思考题： 为什么 Golang 的 `sync/atomic` 包没有用范型的方式，而是直接创建了多个类型 `atomic.Bool`, `atomic.Int32` etc?

<!--more-->

答案其实也很简单，rsc 有在 github issue 里回复过，总结而言：

1. 不同类型的方法是不同的。例如 Bool 和 Pointer[T] 类型不应该有 Add 方法,而整数类型应该有Add方法。泛型无法实现这种不同类型不同的方法。
2. 没有办法写一个通用的约束来限制这些类型。例如写一个约束 `atomic.Val[*byte]` 需要写 `[T ~*E, E any]`，但是无法同时添加其他类型。
  * 以及如果使用泛型，类型推断会更加复杂。例如如果 T 推断为 bool，就不知道 E 是什么类型了。
3. 使用泛型的调用代码会更加重复冗长，例如atomic.Int[int32],而直接用atomic.Int32更简洁。
5. 泛型函数体内实现也会更加复杂。

rsc 的总结是：The non-generic API is simpler to explain and easier to use.

Refer: [sync/atomic: add typed atomic values](https://github.com/golang/go/issues/50860)
