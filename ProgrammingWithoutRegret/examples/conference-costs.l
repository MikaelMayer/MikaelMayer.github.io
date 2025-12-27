// output: raw
let minBound bound = {apply=\x. !x, update=\p. if(p.outputNew <= bound && p.input > bound) {value = bound} else if(p.outputNew > bound) {value = p.outputNew} else {}} in
let registeredParticipants = 200 in
let registrationFee = 50 in
let sponsors = 20000 in
let lunch = (minBound 20) 30 in
let venue = 30000 in 
let days = !3 in
let income = !registeredParticipants * registrationFee + !sponsors in
let expenses = !registeredParticipants * lunch * days + !venue in
let surplus = income - expenses in

// Change surplus to 0, it changes the lunch but will stop at 20, so the surplus will be negative.
// Change surplus to 0 again, it changes the registration fee.
[["surplus", surplus], ["expenses ", expenses ], ["income ", income ], ["registeredParticipants", registeredParticipants ], ["registrationFee  ", registrationFee ], ["sponsors  ", sponsors ], ["lunch  ", lunch ]]