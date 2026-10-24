let list = {hd= "1", tail= {hd= "2", tail= {hd= "3", tail= {}}}} in
letrec mkString = λl.λsep.l match {
case {hd= p, tail= r & {hd= q}} => p + sep + mkString r sep
case {hd= p} => p
case {} => ""
} in
mkString list ","