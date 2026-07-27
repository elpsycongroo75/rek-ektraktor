// Parser registry - loaded after all parser scripts
window.Parsers = {
    bca: new BCAParser(),
    bni: new BNIParser(),
    bsi: new BSIParser(),
    danamon: new DanamonParser(),
    mandiri: new MandiriParser(),
    bankjakarta: new BankJakartaParser()
};
