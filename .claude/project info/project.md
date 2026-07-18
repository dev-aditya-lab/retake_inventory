# Project Title
Retake inventory management system and billing software for for my company. The system will help to manage inventory, track sales, and generate invoices efficiently.
- Retake is a spice manufacturing company.

## Features
- final product inventory
    > All the Category, Product, Product ID, Type, Weight, SKU, EAN-12 code listed in './product.csv'
    > EAN-13 barcode generation for each product based on the following format:
        ```text
        890 CC PPP WW VV
        890 = India
        CC = Category

        11 = Whole
        12 = Powder
        13 = Blend

        PPP = Product ID

        001 = Turmeric
        002 = Red Chilli
        ...
        101 = Garam Masala
        102 = Kitchen King

        WW = Weight ID

        01 = 25g
        02 = 50g
        03 = 100g
        04 = 200g
        05 = 250g

        VV = Variant (currently 01, reserved for future use)
        ```
    - product name
    - product img
    - category
    - weight
    - product ID
    - quantity in stock
    - SKU
    - selling price per unit
    - cost price per unit
    - HSN/SAC code
    - EAN-13 barcode no
        >To make an EAN-13 barcode in Node.js, you can use the JsBarcode library alongside canvas. This allows you to generate valid 13-digit EAN sequences (including the auto-calculated check digit) as PNG or SVG files directly on your server.
        >sample code: 
        ```javascript
        const { createCanvas } = require('canvas');
        const JsBarcode = require('jsbarcode');
        const fs = require('fs');

        // Initialize the canvas and the base 12-digit number 
        const canvas = createCanvas();
        const barcodeData = "123456789012"; // 12 digits (Country + Manufacturer + Product)

        // Generate the EAN-13 barcode
        // JsBarcode will automatically calculate and append the 13th check digit
        JsBarcode(canvas, barcodeData, {
          format: "EAN13",
          lineColor: "#000",
          width: 2,
          height: 100,
          displayValue: true
        });

        // Save the barcode as a PNG file
        const buffer = canvas.toBuffer("image/png");
        fs.writeFileSync("./ean13-barcode.png", buffer);
        console.log("EAN-13 Barcode generated successfully!");
        ```
        > EAN-13 code percess
        ```text
        The 13th digit of an EAN-13 barcode is never random; it is a mathematical checksum calculated using a strict "Modulo 10" formula based on the first 12 digits. If your 12 digits change slightly, the 13th digit can change dramatically, which makes it look random at first glance.
        Here is the exact step-by-step formula used to calculate the 13th digit:
        ## 1. Multiply Alternating Digits
        Add up all the digits in the odd positions (1st, 3rd, 5th, etc.) and multiply them by 1.
        Add up all the digits in the even positions (2nd, 4th, 6th, etc.) and multiply them by 3.
        ## 2. Sum the Totals
        Add those two results together to get one grand total.
        ## 3. Apply Modulo 10
        Find the remainder when your grand total is divided by 10 (Total % 10). [1] 
        ## 4. Subtract from 10
        Subtract that remainder from 10. The result is your 13th digit. (If the remainder is 0, the check digit is 0).
        ------------------------------
        ## Step-by-Step Example
        Let's calculate the check digit for the 12-digit sequence: 400638133393
        ## Step 1: Multiply by Weights

        * 
        * Odd positions (Weight 1): $4 + 0 + 3 + 1 + 3 + 9 = 20 \times 1 = \mathbf{20}$
        * Even positions (Weight 3): $0 + 6 + 8 + 3 + 3 + 3 = 23 \times 3 = \mathbf{69}$
        * 

        ## Step 2: Sum Totals
        $$20 + 69 = \mathbf{89}$$ 
        ## Step 3: Find Remainder
        $$89 \div 10 = 8 \text{ remainder } \mathbf{9}$$ 
        ## Step 4: Subtract from 10
        $$10 - 9 = \mathbf{1}$$ 
        The final 13-digit EAN barcode is 4006381333931.
        ------------------------------
        ## ✅ Formula Summary
        The exact mathematical formula used by Node.js or any scanner to determine the 13th digit is:
        $$\text{Check Digit} = (10 - (\text{Grand Total} \pmod{10})) \pmod{10}$$ 
        ```
    - note
- invoice generation (with GST tax calculation/without GST tax calculation and may other filed are optional dont required any filed)
    - Brand logo
    - invoice number (automatically generated as per the following format)
        - Format: `RTK-INV-YYMMDD-XXXX` e.g. RTK-INV-240615-0001
    - billing date
    - Company details
        - company name
        - company address
        - company contact number
        - company email
        - company GSTIN
        - company phone number
        - website
    - Customer details
        - customer name
        - customer company name
        - customer address
        - customer contact number
        - customer email
        - customer GSTIN
    - per product details
        - serial number
        - product name
        - HSN/SAC code
        - product quantity
        - product unit price
        - Total
    - all product
        - GST tax percentage (IGST, CGST, SGST)
        - GST tax amount
        - Other charges (if any)
        - Grand total
    - amount in words
    - text:- this is a computer generated invoice and does not require signature.
    - 2 Line terms and conditions
    - payment method (check box)
        - cash
        - cheque
        - UPI
        - bank transfer
    - footer
        - other company details
        - invoice barcode
- Options for invoice generation
    - send digital invoice download link to customer whatsapp (meta whatsapp API)
        - template message for whatsapp 
            > tamplate name: `cus_digital_invoice_01`
            > whatsapp no: `+91 8506933428`
            ```text
                Hey *{{1}}*! 🌶️
                Thanks for stopping by Retake today! Your spice collection just got a massive upgrade.

                Here is the digital receipt for your in-store purchase:
                *_Total: {{2}}_*
                *_Invoice: {{3}}_*

                Tap the link below to view or download your invoice. Pull up to our digital pages and show us what you cook up! 🍳📸
            ```
            ```text
            {{1}} - customer name
            {{2}} - total amount
            {{3}} - invoice number
            ```
            - Button
                - download invoice dynamically btn {{1}}
    - print invoice
    - generate invoice in PDF format
- Admin dashboard
    - add features as any this type of admin dashboard have in industry.
- multi user billing system
    - user login
    - user registration
    - user roles (admin, sales, inventory manager)
    - user permissions
- sales tracking
    - daily sales report
    - monthly sales report
    - yearly sales report
    - product-wise sales report
    - user-wise sales report
- other features
    - export data to CSV or Excel
    - import data from CSV or Excel
    - EAN-13 barcode generator
        - a dedicated page
        - inside single product page
        > i dont to upload barcode image in cloudinary, buz if the we have the code the barcode is same then when we need barcode we can generate it dynamically using the code and product details. and download it as PNG or SVG file. no need to store it in cloudinary or any other cloud storage.
    - barcode scanner integration
        - Globle barcode
            - add product inventory (if bardcode is not found in inventory ask user to add product details)
            - see product details (if barcode is found in inventory show product details)
        - inside add product page
            - scan barcode user fill the other details
        - for invoice generation
            - scan to add product in invoice or may be mutli cart option is more better (if mutlipale customer are in store and they want to buy product at same time then we can add multiple cart option for each customer and generate invoice for each customer like if customer take more time to select product then we can make billing of other customer can also select product and generate invoice )
        - when barcode read bep a sound ("./barcode-read-bep.mp3")
        - a globle page for download invoice (by customer or any one)
            - using url "/invoice/:invoice_number" we can download invoice in PDF format or print it.
            - download invoice use barcode scanner or enter invoice number manually.
                - page:- "/invoice"
