#! /bin/zsh
# Sends a mix of good and bad requests so every kind of log event shows up in Grafana.
# Assumes the data from generateUsers.sh exists (the admin user and the menu).
if [ -z "$1" ]; then
  echo "Usage: $0 <host> [rounds]"
  echo "Example: $0 http://localhost:3000 5"
  exit 1
fi
host=$1
rounds=${2:-3}
json='Content-Type: application/json'

# request <label> <curl args...>: prints the status code of the response
request() {
  local label=$1
  shift
  echo "  $label -> $(curl -s -o /dev/null -w '%{http_code}' "$@")"
}

admin_token=$(curl -s -X PUT $host/api/auth -d '{"email":"a@jwt.com", "password":"admin"}' -H "$json" | jq -r '.token')

for round in $(seq 1 $rounds); do
  echo "Round $round of $rounds"
  name="traffic$RANDOM"

  # Auth: register, a bad register, login, a wrong password
  request "register" -X POST $host/api/auth -H "$json" -d "{\"name\":\"$name\", \"email\":\"$name@jwt.com\", \"password\":\"$name\"}"
  request "register missing fields" -X POST $host/api/auth -H "$json" -d "{\"name\":\"$name\"}"
  token=$(curl -s -X PUT $host/api/auth -H "$json" -d "{\"email\":\"$name@jwt.com\", \"password\":\"$name\"}" | jq -r '.token')
  request "login wrong password" -X PUT $host/api/auth -H "$json" -d "{\"email\":\"$name@jwt.com\", \"password\":\"wrong\"}"

  # Anonymous and authenticated reads
  request "menu" $host/api/order/menu
  request "franchises" $host/api/franchise
  request "me" $host/api/user/me -H "Authorization: Bearer $token"
  request "order history" $host/api/order -H "Authorization: Bearer $token"
  request "admin franchises" $host/api/franchise -H "Authorization: Bearer $admin_token"

  # Orders: these call the pizza factory
  request "order" -X POST $host/api/order -H "$json" -H "Authorization: Bearer $token" -d '{"franchiseId":1, "storeId":1, "items":[{"menuId":1, "description":"Veggie", "price":0.0038}, {"menuId":2, "description":"Pepperoni", "price":0.0042}]}'
  request "order with unknown menu item (500)" -X POST $host/api/order -H "$json" -H "Authorization: Bearer $token" -d '{"franchiseId":1, "storeId":1, "items":[{"menuId":9999, "description":"Ghost", "price":1}]}'

  # Requests that should be rejected
  request "order without auth" $host/api/order
  request "menu update as diner" -X PUT $host/api/order/menu -H "$json" -H "Authorization: Bearer $token" -d '{"title":"Nope", "description":"x", "image":"x.png", "price":1}'
  request "malformed json" -X POST $host/api/auth -H "$json" -d '{"name":'
  request "unknown endpoint" $host/api/nothing-here

  request "logout" -X DELETE $host/api/auth -H "Authorization: Bearer $token"
  sleep 1
done

echo "Traffic sent"
