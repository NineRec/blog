---
title: "Thoughts On Code Structure"
categories: [golang]
tags: [golong]
date: 2019-09-30T09:19:44+08:00
lastmod: 2021-02-07T09:19:44+08:00
---

在前公司和现公司，都有纠结过代码目录结构的问题。

<!--more-->

### Why - 价值

去纠结代码结构，本身的目的，是为了能够达到代码的可扩展，从而更轻松的完成需求的迭代。 

这里引用下 Martin 博客上的几句话，其余不在赘述。

> Software that contains a lot of cruft is much harder to modify, leading to features that arrive more slowly and with more defects.  
> ......  
> High internal quality leads to faster delivery of new features ...... attention to internal quality pays off in weeks not months         
>   --- Martin Fowlers

粗略翻译如下：

> 包含大量 Cruft(废弃/冗余/混乱 etc) 代码的软件更难修改，导致新功能的推出速度变慢且缺陷变多。
> ......
> 高内部质量有助于加速新功能的交付......专注于提升软件的内部质量，其益处可以在数周内显现，而非数月。


### How - 方法和建议

[TBD]
