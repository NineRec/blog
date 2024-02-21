---
title: "Golang Embedding Struct"
categories: [golang]
date: 2024-02-18T18:08:58+08:00
lastmod: 2024-02-18T18:08:58+08:00
url: /post/golang-embedding-struct
---

公司代码遇到了 nil pointer 的 panic，结果第一眼看过去，是 protobuf 生成的 GetXXX 风格的代码。 

花了些时间写出示例代码，其实也就找到了问题的关键词，剩下的 GPT 就可以帮忙解释了。关键词是： Embedded Struct。

<!--more-->

## 代码示例

Playground link: https://go.dev/play/p/Y457QhV-0NJ

```go
package main

import (
	"fmt"
)

type Foo struct {
}

func (m *Foo) DoNothing() {
	fmt.Println("Fine here")
}

type EmbeddingFoo struct {
	*Foo
}

func main() {
	var varFoo *Foo
	var varEFoo *EmbeddingFoo
	newEFoo := new(EmbeddingFoo)

	fmt.Println("VarFoo: ", varFoo)
	fmt.Println("VarEFoo: ", varEFoo)
	fmt.Println("NewEFoo: ", newEFoo)

	varFoo.DoNothing()
	newEFoo.DoNothing()
	// varEFoo.DoNothing() // will panic here
	// varEFoo.Foo.DoNothing() // same as above
}
```

## GPT 的解释

The last two commented lines in the Go code will cause a panic because `varEFoo` is a nil pointer to an `EmbeddingFoo` struct, which itself embeds a pointer to a `Foo` struct. When you try to call a method on a nil pointer, Go will panic at runtime.

Here's a step-by-step explanation in pseudocode:

1. `varEFoo` is declared as a pointer to `EmbeddingFoo` but is not initialized, so it is nil.
2. `newEFoo` is initialized correctly using `new(EmbeddingFoo)`, which allocates memory and sets the embedded `Foo` pointer to nil.
3. `varFoo.DoNothing()` works because methods on nil pointers to structs are valid in Go as long as they do not reference any fields of the struct.
4. `newEFoo.DoNothing()` works because `newEFoo` is an initialized pointer to `EmbeddingFoo`, and the `DoNothing` method is promoted from the embedded `Foo` struct.
5. `varEFoo.DoNothing()` will panic because `varEFoo` is nil, and you are trying to call a method on it.
6. `varEFoo.Foo.DoNothing()` will also panic because you are trying to dereference `Foo` on a nil `varEFoo`.

Now, here's the explanation in Go comments:

```go
// varEFoo is a nil pointer to an EmbeddingFoo, which means it points to no actual memory allocation.
// Calling a method on a nil pointer will cause a runtime panic.
// varEFoo.DoNothing() // will panic here

// Even though DoNothing() can be called on a nil *Foo receiver,
// varEFoo itself is nil, so attempting to access its embedded Foo (which is also nil) will cause a panic.
// varEFoo.Foo.DoNothing() // same as above
```

Remember, in Go, you can call methods on nil struct pointers if the method does not access any struct fields. However, if the struct pointer itself is nil, dereferencing it in any way, such as calling a method, will cause a runtime panic.

对于 varFoo 和 varEFoo 都是 nil pointer，调用 `DoNothing()` 情况不同的更详细的解释如下：

- `varFoo.DoNothing()`
  - Check if `DoNothing()` can be called on `*Foo` (it can).
  - Call `DoNothing()` on `nil` receiver of type `*Foo` (allowed in Go, no panic).

- `varEFoo.DoNothing()`
  - Check if `DoNothing()` can be called on `*EmbeddingFoo` (it can because `Foo` is embedded).
  - Attempt to automatically dereference `varEFoo` to get to `Foo`.
  - `varEFoo` is nil, so dereferencing it causes a panic.

In summary, the panic occurs not because of the `DoNothing` method itself, but because of the attempt to dereference a nil pointer to access an embedded field's method.
