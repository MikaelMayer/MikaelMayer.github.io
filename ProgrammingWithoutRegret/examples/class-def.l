letrec class self = self & {apply= \elem. class (self & {children= self.children ++ [elem]})} in
let div = class { tag= "DIV", children= [] } in
(div "a" "b" "c").children