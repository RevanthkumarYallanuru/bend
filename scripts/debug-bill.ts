import axios from "axios";

async function main() {
  const login = await axios.post(
    "http://localhost:5000/api/auth/login",
    {
      username: "admin",
      password: "ChangeMe@123",
    }
  );

  const token = login.data.data.token as string;

  try {
    const response = await axios.post(
      "http://localhost:5000/api/bills",
      {
        bill_type: "CUSTOMER",
        customer_id: "1",
        amount_paid: 500,
        payment_method: "CASH",
        discount: 100,
        items: [
          {
            item_id: "1",
            quantity: 10,
            actual_rate: 47,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("OK", response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(
        error.response?.status,
        JSON.stringify(error.response?.data, null, 2)
      );
    } else {
      console.error(error);
    }
  }
}

main();
